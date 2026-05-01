import type { FetchResult, FetchOptions } from "./types.js";
export declare class FetchError extends Error {
  readonly url: string;
  readonly status?: number | undefined;
  constructor(message: string, url: string, status?: number | undefined);
}
export declare function fetchAndParse(url: string, options?: FetchOptions): Promise<FetchResult>;
