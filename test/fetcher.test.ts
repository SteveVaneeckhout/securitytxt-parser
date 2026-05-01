import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchAndParse, FetchError } from "../src/fetcher.js";

const FUTURE = new Date("2099-01-01T00:00:00Z");

const VALID_BODY = "Contact: mailto:security@example.com\nExpires: 2099-12-31T23:59:59Z\n";

type FakeFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

function makeFetch(
  body: string,
  status = 200,
  headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8" },
): FakeFetch {
  return async () => {
    const h = new Headers(headers);
    return new Response(body, { status, headers: h });
  };
}

function setFetch(fn: FakeFetch): void {
  (globalThis as Record<string, unknown>)["fetch"] = fn;
}

beforeEach(() => {
  setFetch(makeFetch(VALID_BODY));
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>)["fetch"];
});

describe("fetchAndParse()", () => {
  it("throws TypeError for non-HTTPS URL", async () => {
    await expect(fetchAndParse("http://example.com/.well-known/security.txt")).rejects.toThrow(
      TypeError,
    );
  });

  it("throws TypeError for non-HTTPS scheme", async () => {
    await expect(fetchAndParse("ftp://example.com/security.txt")).rejects.toThrow(TypeError);
  });

  it("returns parsed result for a valid response", async () => {
    const result = await fetchAndParse("https://example.com/.well-known/security.txt", {
      now: FUTURE,
    });
    expect(result.httpStatus).toBe(200);
    expect(result.contacts).toHaveLength(1);
    expect(result.isValid).toBe(true);
    expect(result.url).toBe("https://example.com/.well-known/security.txt");
  });

  it("captures content-type header", async () => {
    const result = await fetchAndParse("https://example.com/.well-known/security.txt", {
      now: FUTURE,
    });
    expect(result.contentType).toBe("text/plain; charset=utf-8");
  });

  it("handles missing content-type as null", async () => {
    setFetch(
      async () =>
        ({
          status: 200,
          url: "https://example.com/.well-known/security.txt",
          headers: { get: (_name: string) => null },
          text: async () => VALID_BODY,
        }) as unknown as Response,
    );
    const result = await fetchAndParse("https://example.com/.well-known/security.txt", {
      now: FUTURE,
    });
    expect(result.contentType).toBeNull();
  });

  it("still parses body even for non-200 status", async () => {
    setFetch(makeFetch(VALID_BODY, 404, { "content-type": "text/plain" }));
    const result = await fetchAndParse("https://example.com/.well-known/security.txt", {
      now: FUTURE,
    });
    expect(result.httpStatus).toBe(404);
    expect(result.contacts).toHaveLength(1);
  });

  it("handles timeout via AbortError", async () => {
    setFetch((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
          });
        }
      });
    });
    await expect(
      fetchAndParse("https://example.com/.well-known/security.txt", { timeoutMs: 1 }),
    ).rejects.toThrow(FetchError);
  });

  it("passes redirect:manual when followRedirects is false", async () => {
    let capturedInit: RequestInit | undefined;
    setFetch(async (_url, init) => {
      capturedInit = init;
      return new Response(VALID_BODY, {
        status: 200,
        headers: new Headers({ "content-type": "text/plain" }),
      });
    });
    await fetchAndParse("https://example.com/.well-known/security.txt", {
      followRedirects: false,
      now: FUTURE,
    });
    expect(capturedInit?.redirect).toBe("manual");
  });

  it("re-throws non-abort network errors as-is", async () => {
    const networkError = new TypeError("Failed to fetch");
    setFetch(async () => {
      throw networkError;
    });
    await expect(fetchAndParse("https://example.com/.well-known/security.txt")).rejects.toThrow(
      networkError,
    );
  });
});
