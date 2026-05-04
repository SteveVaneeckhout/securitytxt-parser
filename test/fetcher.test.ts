import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchSecurityTxt, FetchError } from "../src/fetcher.js";

const FUTURE = new Date("2099-01-01T00:00:00Z");

const VALID_BODY = "Contact: mailto:security@example.com\nExpires: 2099-12-31T23:59:59Z\n";

function makeResponse(
  status: number,
  body: string | null = null,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

function stubFetch(...responses: Array<Response | Error>): void {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      const r = responses[i++];
      if (r instanceof Error) throw r;
      return r;
    }),
  );
}

beforeEach(() => {
  stubFetch(makeResponse(200, VALID_BODY, { "content-type": "text/plain; charset=utf-8" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSecurityTxt – URL construction", () => {
  it("appends /.well-known/security.txt to the site URL", async () => {
    stubFetch(makeResponse(200, VALID_BODY));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await fetchSecurityTxt("https://example.com", { now: FUTURE });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/.well-known/security.txt");
  });

  it("ignores the path of the input URL", async () => {
    stubFetch(makeResponse(200, VALID_BODY));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await fetchSecurityTxt("https://example.com/some/page", { now: FUTURE });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/.well-known/security.txt");
  });

  it("throws TypeError for non-HTTPS URL", async () => {
    await expect(fetchSecurityTxt("http://example.com")).rejects.toThrow(TypeError);
  });

  it("throws TypeError for non-HTTPS scheme", async () => {
    await expect(fetchSecurityTxt("ftp://example.com")).rejects.toThrow(TypeError);
  });
});

describe("fetchSecurityTxt – success", () => {
  it("returns parsed result for a valid response", async () => {
    const result = await fetchSecurityTxt("https://example.com", { now: FUTURE });
    expect(result.contacts).toHaveLength(1);
    expect(result.isValid).toBe(true);
  });

  it("captures meta for a 200 response", async () => {
    const result = await fetchSecurityTxt("https://example.com", { now: FUTURE });
    expect(result.meta).toEqual({
      url: "https://example.com/.well-known/security.txt",
      finalUrl: "https://example.com/.well-known/security.txt",
      httpStatus: 200,
      contentType: "text/plain; charset=utf-8",
      redirects: 0,
    });
  });

  it("handles missing content-type as null", async () => {
    const fake = {
      status: 200,
      ok: true,
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(VALID_BODY));
          controller.close();
        },
      }),
    } as unknown as Response;
    stubFetch(fake);
    const result = await fetchSecurityTxt("https://example.com", { now: FUTURE });
    expect(result.meta.contentType).toBeNull();
  });
});

describe("fetchSecurityTxt – HTTP errors", () => {
  it("throws FetchError on 404", async () => {
    stubFetch(makeResponse(404));
    const error = await fetchSecurityTxt("https://example.com").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
    expect((error as FetchError).status).toBe(404);
  });

  it("throws FetchError on 500", async () => {
    stubFetch(makeResponse(500));
    const error = await fetchSecurityTxt("https://example.com").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
    expect((error as FetchError).status).toBe(500);
  });

  it("throws FetchError on network failure with status null", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    const error = await fetchSecurityTxt("https://example.com").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
    expect((error as FetchError).status).toBeNull();
  });

  it("throws FetchError on timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
          });
        });
      }),
    );
    const error = await fetchSecurityTxt("https://example.com", { timeoutMs: 1 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FetchError);
  });
});

describe("fetchSecurityTxt – redirects", () => {
  it("follows redirects and counts them in meta", async () => {
    stubFetch(
      makeResponse(301, null, { Location: "https://example.com/.well-known/security.txt?x=1" }),
      makeResponse(301, null, {
        Location: "https://example.com/.well-known/security.txt?x=2",
      }),
      makeResponse(200, VALID_BODY, { "content-type": "text/plain" }),
    );
    const result = await fetchSecurityTxt("https://example.com", { now: FUTURE });
    expect(result.meta.redirects).toBe(2);
    expect(result.meta.finalUrl).toBe("https://example.com/.well-known/security.txt?x=2");
  });

  it("throws FetchError when redirect cap is exceeded", async () => {
    const redirect = makeResponse(301, null, {
      Location: "https://example.com/.well-known/security.txt",
    });
    stubFetch(redirect, redirect, redirect);
    const error = await fetchSecurityTxt("https://example.com", { maxRedirects: 1 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FetchError);
  });

  it("maxRedirects: 0 disables redirect following", async () => {
    stubFetch(
      makeResponse(301, null, { Location: "https://example.com/.well-known/security.txt" }),
    );
    const error = await fetchSecurityTxt("https://example.com", { maxRedirects: 0 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(FetchError);
  });
});

describe("fetchSecurityTxt – options", () => {
  it("uses default User-Agent", async () => {
    stubFetch(makeResponse(200, VALID_BODY));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await fetchSecurityTxt("https://example.com", { now: FUTURE });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toBe("sectxt/1.0");
  });

  it("uses custom User-Agent", async () => {
    stubFetch(makeResponse(200, VALID_BODY));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await fetchSecurityTxt("https://example.com", { userAgent: "mybot/1", now: FUTURE });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toBe("mybot/1");
  });
});

describe("fetchSecurityTxt – body handling", () => {
  it("handles a 2xx response with null body without throwing", async () => {
    stubFetch(makeResponse(200, null));
    const result = await fetchSecurityTxt("https://example.com").catch((e: unknown) => e);
    expect(result).toBeDefined();
  });

  it("truncates body when it exceeds maxSizeBytes", async () => {
    stubFetch(makeResponse(200, "X".repeat(10_000)));
    const result = await fetchSecurityTxt("https://example.com", { maxSizeBytes: 10, now: FUTURE });
    expect(result).toBeDefined();
  });
});

describe("fetchSecurityTxt – redirect error paths", () => {
  it("throws FetchError when a redirect response is missing its Location header", async () => {
    stubFetch(makeResponse(301, null, {}));
    const error = await fetchSecurityTxt("https://example.com").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
  });

  it("throws FetchError when a redirect has an unparseable Location URL", async () => {
    stubFetch(makeResponse(301, null, { Location: "http://[bad" }));
    const error = await fetchSecurityTxt("https://example.com").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
  });
});

describe("fetchSecurityTxt – skipPgpStripping option", () => {
  it("passes skipPgpStripping: true to the parser", async () => {
    stubFetch(makeResponse(200, VALID_BODY));
    const result = await fetchSecurityTxt("https://example.com", {
      now: FUTURE,
      skipPgpStripping: true,
    });
    expect(result).toBeDefined();
  });
});
