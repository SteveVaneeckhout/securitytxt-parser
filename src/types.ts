export interface RawField {
  name: string;
  value: string;
  lineNumber: number;
}

export interface ContactField {
  type: "contact";
  value: string;
  scheme: string;
  lineNumber: number;
}

export interface ExpiresField {
  type: "expires";
  value: string;
  date: Date | null;
  lineNumber: number;
}

export interface AcknowledgmentsField {
  type: "acknowledgments";
  value: string;
  lineNumber: number;
}

export interface CanonicalField {
  type: "canonical";
  value: string;
  lineNumber: number;
}

export interface EncryptionField {
  type: "encryption";
  value: string;
  scheme: string;
  lineNumber: number;
}

export interface HiringField {
  type: "hiring";
  value: string;
  lineNumber: number;
}

export interface PolicyField {
  type: "policy";
  value: string;
  lineNumber: number;
}

export interface PreferredLanguagesField {
  type: "preferred-languages";
  value: string;
  languages: string[];
  lineNumber: number;
}

export interface ExtensionField {
  type: "extension";
  name: string;
  value: string;
  lineNumber: number;
}

export type KnownField =
  | ContactField
  | ExpiresField
  | AcknowledgmentsField
  | CanonicalField
  | EncryptionField
  | HiringField
  | PolicyField
  | PreferredLanguagesField;

export type ParsedField = KnownField | ExtensionField;

export type Severity = "error" | "recommendation";

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  lineNumber?: number;
}

export interface PgpInfo {
  signed: boolean;
  hashAlgorithms: string[];
  signatureBlock: string;
}

export interface ParseResult {
  contacts: ContactField[];
  expires: ExpiresField | null;
  acknowledgments: AcknowledgmentsField[];
  canonical: CanonicalField[];
  encryption: EncryptionField[];
  hiring: HiringField[];
  policy: PolicyField[];
  preferredLanguages: PreferredLanguagesField | null;
  extensions: ExtensionField[];
  fields: ParsedField[];
  errors: Diagnostic[];
  recommendations: Diagnostic[];
  pgp: PgpInfo;
  isValid: boolean;
  lineCount: number;
  byteCount: number;
}

export interface FetchResult extends ParseResult {
  url: string;
  httpStatus: number;
  contentType: string | null;
  finalUrl: string;
}

export interface ParseOptions {
  skipPgpStripping?: boolean;
  now?: Date;
}

export interface FetchOptions extends ParseOptions {
  timeoutMs?: number;
  followRedirects?: boolean;
}
