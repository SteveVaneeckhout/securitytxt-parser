# sectxt

A TypeScript library for parsing and validating [`security.txt`](https://securitytxt.org/) files per [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116).

Returns all fields as typed objects, surfaces RFC violations as `errors`, and surfaces advisory best-practice checks as `recommendations`.

## Features

- Full RFC 9116 field parsing — Contact, Expires, Acknowledgments, Canonical, Encryption, Hiring, Policy, Preferred-Languages, extension fields
- OpenPGP cleartext signature detection (RFC 4880 dash-escaping handled)
- 18 error codes for MUST/MUST NOT violations
- 10 recommendation codes for SHOULD/best-practice guidance
- Optional URL fetcher with timeout and redirect control
- Zero runtime dependencies
- ESM-only, Node.js ≥ 24.15.0

## Installation

```bash
npm install sectxt
```

## Quick Start

### Parse a file

```typescript
import { parse } from "sectxt";

const content = `Contact: mailto:security@example.com
Expires: 2026-12-31T23:59:59Z
`;

const result = parse(content);

console.log(result.isValid); // true/false
console.log(result.contacts); // ContactField[]
console.log(result.expires); // ExpiresField | null
console.log(result.errors); // Diagnostic[] — RFC violations
console.log(result.recommendations); // Diagnostic[] — best-practice advice
```

### Fetch and parse from a URL

```typescript
import { fetchSecurityTxt } from "sectxt";

// Pass the site origin; "/.well-known/security.txt" is appended for you.
const result = await fetchSecurityTxt("https://example.com");

console.log(result.meta.httpStatus); // 200
console.log(result.meta.contentType); // 'text/plain; charset=utf-8'
console.log(result.meta.redirects); // number of redirects followed
console.log(result.isValid); // true/false
```

## API

### `parse(input, options?)`

Parses the raw text content of a `security.txt` file.

```typescript
function parse(input: string, options?: ParseOptions): ParseResult;
```

**`ParseOptions`**

| Property           | Type      | Default      | Description                                                        |
| ------------------ | --------- | ------------ | ------------------------------------------------------------------ |
| `now`              | `Date`    | `new Date()` | Reference time for Expires checks. Useful for deterministic tests. |
| `skipPgpStripping` | `boolean` | `false`      | Treat the input as plain text without PGP armor detection.         |

### `fetchSecurityTxt(siteUrl, options?)`

Fetches `/.well-known/security.txt` from the given site origin and parses the response body. Requires an `https://` URL.

```typescript
async function fetchSecurityTxt(siteUrl: string, options?: FetchOptions): Promise<FetchResult>;
```

Throws `TypeError` for non-HTTPS URLs. Throws `FetchError` for non-2xx responses, network errors, timeouts, and redirect-cap exceeded.

**`FetchOptions`** — extends `ParseOptions` with:

| Property       | Type     | Default        | Description                               |
| -------------- | -------- | -------------- | ----------------------------------------- |
| `timeoutMs`    | `number` | `10000`        | Abort the request after this many ms      |
| `userAgent`    | `string` | `'sectxt/1.0'` | `User-Agent` header sent with the request |
| `maxRedirects` | `number` | `5`            | Maximum redirects to follow (0 disables)  |
| `maxSizeBytes` | `number` | `64 * 1024`    | Response body cap in bytes                |

### `FetchError`

```typescript
class FetchError extends Error {
  readonly url: string;
  readonly status: number | null; // HTTP status, or null for network/timeout
}
```

### `FetchMeta`

Returned on `FetchResult.meta`:

```typescript
interface FetchMeta {
  url: string;
  finalUrl: string;
  httpStatus: number | null;
  contentType: string | null;
  redirects: number;
}
```

## Result Types

### `ParseResult`

| Property             | Type                              | Description                          |
| -------------------- | --------------------------------- | ------------------------------------ |
| `contacts`           | `ContactField[]`                  | All Contact fields in document order |
| `expires`            | `ExpiresField \| null`            | First Expires field, or null         |
| `acknowledgments`    | `AcknowledgmentsField[]`          | All Acknowledgments fields           |
| `canonical`          | `CanonicalField[]`                | All Canonical fields                 |
| `encryption`         | `EncryptionField[]`               | All Encryption fields                |
| `hiring`             | `HiringField[]`                   | All Hiring fields                    |
| `policy`             | `PolicyField[]`                   | All Policy fields                    |
| `preferredLanguages` | `PreferredLanguagesField \| null` | First Preferred-Languages field      |
| `extensions`         | `ExtensionField[]`                | Unknown (extension) fields           |
| `fields`             | `ParsedField[]`                   | All fields in document order         |
| `errors`             | `Diagnostic[]`                    | RFC violations                       |
| `recommendations`    | `Diagnostic[]`                    | Advisory checks                      |
| `pgp`                | `PgpInfo`                         | PGP signature metadata               |
| `isValid`            | `boolean`                         | `errors.length === 0`                |
| `lineCount`          | `number`                          | Number of lines in the parsed body   |
| `byteCount`          | `number`                          | UTF-8 byte size of the input         |

`FetchResult` extends `ParseResult` with a `meta: FetchMeta` field.

### `Diagnostic`

```typescript
interface Diagnostic {
  severity: "error" | "recommendation";
  code: string; // e.g. 'MISSING_CONTACT'
  message: string; // Human-readable description with RFC reference
  lineNumber?: number;
}
```

### Field types

All field types carry `type`, `value`, and `lineNumber`. Additional properties:

| Type                      | Extra properties                                                        |
| ------------------------- | ----------------------------------------------------------------------- |
| `ContactField`            | `scheme: string` — the URI scheme (e.g. `'mailto'`, `'https'`, `'tel'`) |
| `ExpiresField`            | `date: Date \| null` — parsed RFC 3339 date, or `null` if unparseable   |
| `EncryptionField`         | `scheme: string`                                                        |
| `PreferredLanguagesField` | `languages: string[]` — individual language tags                        |
| `ExtensionField`          | `name: string` — original field name (not lowercased)                   |

### `PgpInfo`

```typescript
interface PgpInfo {
  signed: boolean;
  hashAlgorithms: string[]; // e.g. ['SHA256']
  signatureBlock: string; // Raw base64 signature (not cryptographically verified)
}
```

## Diagnostic Codes

### Errors

| Code                              | Description                                                       |
| --------------------------------- | ----------------------------------------------------------------- |
| `MISSING_CONTACT`                 | No Contact field present                                          |
| `MISSING_EXPIRES`                 | No Expires field present                                          |
| `MULTIPLE_EXPIRES`                | Expires appears more than once                                    |
| `MULTIPLE_PREFERRED_LANGUAGES`    | Preferred-Languages appears more than once                        |
| `EXPIRES_INVALID`                 | Expires value is not a valid RFC 3339 date-time                   |
| `EXPIRES_IN_PAST`                 | Expires date is in the past                                       |
| `CONTACT_INVALID_URI`             | Contact value is not a valid `mailto:`, `tel:`, or `https://` URI |
| `CONTACT_WEB_NOT_HTTPS`           | Contact web URI uses `http://` instead of `https://`              |
| `ACKNOWLEDGMENTS_NOT_HTTPS`       | Acknowledgments URI does not use `https://`                       |
| `CANONICAL_NOT_HTTPS`             | Canonical URI does not use `https://`                             |
| `ENCRYPTION_INVALID_URI`          | Encryption is not an `https://`, `dns:`, or `openpgp4fpr:` URI    |
| `ENCRYPTION_WEB_NOT_HTTPS`        | Encryption web URI uses `http://`                                 |
| `HIRING_NOT_HTTPS`                | Hiring URI does not use `https://`                                |
| `POLICY_NOT_HTTPS`                | Policy URI does not use `https://`                                |
| `PREFERRED_LANGUAGES_EMPTY`       | Preferred-Languages field has no language tags                    |
| `PREFERRED_LANGUAGES_INVALID_TAG` | A language tag fails RFC 5646 syntax                              |
| `INVALID_LINE`                    | Line cannot be parsed as a field or comment                       |
| `INVALID_FIELD_FORMAT`            | Field line is missing a colon or has no value                     |

### Recommendations

| Code                         | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| `EXPIRES_MORE_THAN_ONE_YEAR` | Expires is more than one year in the future                 |
| `EXPIRES_SOON`               | File expires within 14 days                                 |
| `NOT_SIGNED`                 | File is not signed with OpenPGP                             |
| `SIGNED_WITHOUT_CANONICAL`   | Signed file has no Canonical field                          |
| `NO_CANONICAL`               | No Canonical field                                          |
| `CONTACT_NO_ENCRYPTION`      | Email Contact present but no Encryption field               |
| `NO_POLICY`                  | No Policy field                                             |
| `FILE_TOO_LARGE`             | File exceeds the recommended 32 KB limit                    |
| `TOO_MANY_LINES`             | File exceeds the recommended 1,000-line limit               |
| `FIELD_TOO_LONG`             | A field value exceeds the recommended 2,048-character limit |

## PGP Signature Verification

The library detects PGP signatures but does not verify them cryptographically. You can verify using [openpgp.js](https://openpgpjs.org/):

```bash
npm install openpgp
```

```typescript
import { parse } from "sectxt";
import * as openpgp from "openpgp";

// openpgp.js needs the full original armored text, not the stripped body
const rawContent = "..."; // your security.txt content
const result = parse(rawContent);

if (result.pgp.signed) {
  const message = await openpgp.readCleartextMessage({ cleartextMessage: rawContent });

  // The public key can come from an https:// Encryption field or a keyserver.
  // This example fetches it from the first https:// Encryption field:
  const encryptionUrl = result.encryption.find((e) => e.scheme === "https")?.value;
  if (!encryptionUrl) throw new Error("No https:// Encryption field found");

  const armoredKey = await fetch(encryptionUrl).then((r) => r.text());
  const publicKey = await openpgp.readKey({ armoredKey });

  const { signatures } = await openpgp.verify({ message, verificationKeys: publicKey });
  const sig = signatures[0];
  if (!sig) throw new Error("No signatures found in message");

  try {
    await sig.verified; // throws if the signature is invalid
    console.log("Valid signature by key", sig.keyID.toHex());
  } catch (e) {
    console.error("Signature verification failed:", e);
  }
}
```

> **Note:** `openpgp4fpr:` Encryption values point to a key fingerprint rather than a URL. To fetch the key by fingerprint, use a keyserver such as `https://keys.openpgp.org/vks/v1/by-fingerprint/<FINGERPRINT>`.

## Notes

- **PGP signatures are not cryptographically verified** by this library — see the section above for how to add that with openpgp.js.
- **`isValid` reflects RFC conformance only.** A file can be `isValid: true` while still having recommendations.
- Code generated using Claude.ai

## Requirements

- Node.js ≥ 24.15.0
- ESM (`"type": "module"` or `.mjs` files)

## License

MIT
