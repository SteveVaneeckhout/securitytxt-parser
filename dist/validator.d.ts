import type { ParsedField, Diagnostic, PgpInfo } from "./types.js";
export declare function collectErrors(
  fields: ParsedField[],
  _pgp: PgpInfo,
  _byteCount: number,
  _lineCount: number,
  now: Date,
): Diagnostic[];
export declare function collectRecommendations(
  fields: ParsedField[],
  pgp: PgpInfo,
  byteCount: number,
  lineCount: number,
  now: Date,
): Diagnostic[];
