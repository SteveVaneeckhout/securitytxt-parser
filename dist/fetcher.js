import { parse } from "./parser.js";
const DEFAULT_USER_AGENT = "sectxt/1.0";
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_SIZE_BYTES = 64 * 1024;
const SECURITY_TXT_PATH = "/.well-known/security.txt";
export class FetchError extends Error {
  url;
  status;
  constructor(message, url, status = null) {
    super(message);
    this.name = "FetchError";
    this.url = url;
    this.status = status;
  }
}
function resolveOptions(options) {
  return {
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxSizeBytes: options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES,
  };
}
function securityTxtUrl(siteUrl) {
  const u = new URL(SECURITY_TXT_PATH, siteUrl);
  if (u.protocol !== "https:") {
    throw new TypeError(`fetchSecurityTxt requires an https:// URL, got: ${siteUrl}`);
  }
  return u;
}
async function readBodyUpToLimit(response, maxBytes) {
  const { body } = response;
  if (body === null) return "";
  const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  const reader = body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      const remaining = maxBytes - totalBytes;
      if (chunk.byteLength <= remaining) {
        chunks.push(chunk);
        totalBytes += chunk.byteLength;
      } else {
        chunks.push(chunk.slice(0, remaining));
        totalBytes = maxBytes;
        break;
      }
    }
  } finally {
    await reader.cancel();
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decoder.decode(combined);
}
async function fetchWithRedirects(initialUrl, opts) {
  let currentUrl = initialUrl;
  let redirects = 0;
  while (true) {
    let response;
    try {
      response = await fetch(currentUrl.href, {
        redirect: "manual",
        headers: {
          Accept: "text/plain",
          "User-Agent": opts.userAgent,
        },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      const isAbort = err.name === "AbortError" || err.name === "TimeoutError";
      throw new FetchError(
        isAbort
          ? `Request to ${currentUrl.href} timed out after ${opts.timeoutMs}ms`
          : `Failed to fetch ${currentUrl.href}: ${err.message}`,
        currentUrl.href,
        null,
      );
    }
    const { status } = response;
    if (status >= 300 && status < 400) {
      if (redirects >= opts.maxRedirects) {
        throw new FetchError(
          `Too many redirects (>${opts.maxRedirects}) fetching ${initialUrl.href}`,
          currentUrl.href,
          status,
        );
      }
      const location = response.headers.get("Location");
      if (location === null) {
        throw new FetchError(
          `Redirect from ${currentUrl.href} missing Location header`,
          currentUrl.href,
          status,
        );
      }
      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new FetchError(
          `Redirect from ${currentUrl.href} has invalid Location: ${location}`,
          currentUrl.href,
          status,
        );
      }
      currentUrl = nextUrl;
      redirects++;
      continue;
    }
    return { response, finalUrl: currentUrl.href, redirects };
  }
}
export async function fetchSecurityTxt(siteUrl, options = {}) {
  const opts = resolveOptions(options);
  const targetUrl = securityTxtUrl(siteUrl);
  const parseOptions = {};
  if (options.now !== undefined) parseOptions.now = options.now;
  if (options.skipPgpStripping !== undefined)
    parseOptions.skipPgpStripping = options.skipPgpStripping;
  const { response, finalUrl, redirects } = await fetchWithRedirects(targetUrl, opts);
  if (!response.ok) {
    throw new FetchError(
      `HTTP ${response.status} fetching ${targetUrl.href}`,
      targetUrl.href,
      response.status,
    );
  }
  const body = await readBodyUpToLimit(response, opts.maxSizeBytes);
  const contentType = response.headers.get("content-type");
  const parsed = parse(body, parseOptions);
  const meta = {
    url: targetUrl.href,
    finalUrl,
    httpStatus: response.status,
    contentType,
    redirects,
  };
  return { ...parsed, meta };
}
