import type { FetchOptions, FetchResult } from "./types.js";
export declare class FetchError extends Error {
  readonly url: string;
  readonly status: number | null;
  constructor(message: string, url: string, status?: number | null);
}
export declare function fetchSecurityTxt(
  siteUrl: string,
  options?: FetchOptions,
): Promise<FetchResult>;
