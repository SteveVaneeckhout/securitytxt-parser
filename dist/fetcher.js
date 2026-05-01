import { parse } from "./parser.js";
export class FetchError extends Error {
  url;
  status;
  constructor(message, url, status) {
    super(message);
    this.url = url;
    this.status = status;
    this.name = "FetchError";
  }
}
export async function fetchAndParse(url, options = {}) {
  const { timeoutMs = 10_000, followRedirects = true, ...parseOptions } = options;
  if (!url.toLowerCase().startsWith("https://")) {
    throw new TypeError(`fetchAndParse requires an https:// URL, got: ${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: followRedirects ? "follow" : "manual",
      headers: {
        Accept: "text/plain",
        "User-Agent": "sectxt/1.0 (https://github.com/sectxt/sectxt)",
      },
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new FetchError(`Request timed out after ${timeoutMs}ms`, url);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const body = await response.text();
  const contentType = response.headers.get("content-type");
  const finalUrl = response.url || url;
  const parsed = parse(body, parseOptions);
  return {
    ...parsed,
    url,
    httpStatus: response.status,
    contentType,
    finalUrl,
  };
}
