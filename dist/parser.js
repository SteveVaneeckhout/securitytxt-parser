import { Buffer } from "node:buffer";
import { parseRfc3339 } from "./utils/datetime.js";
import { getScheme } from "./utils/uri.js";
import { collectErrors, collectRecommendations } from "./validator.js";
const PGP_HEADER = "-----BEGIN PGP SIGNED MESSAGE-----";
const PGP_SIG_START = "-----BEGIN PGP SIGNATURE-----";
const PGP_SIG_END = "-----END PGP SIGNATURE-----";
function stripPgpArmor(input) {
  if (!input.trimStart().startsWith(PGP_HEADER)) {
    return { pgp: { signed: false, hashAlgorithms: [], signatureBlock: "" }, body: input };
  }
  const lines = input.split(/\r?\n/);
  const hashAlgorithms = [];
  let state = "header";
  const bodyLines = [];
  const sigLines = [];
  for (const line of lines) {
    if (state === "header") {
      // Parse Hash: header lines
      const hashMatch = /^Hash:\s*(.+)$/i.exec(line);
      if (hashMatch?.[1]) {
        hashAlgorithms.push(...hashMatch[1].split(",").map((h) => h.trim()));
      }
      // Blank line separates header from body
      if (line.trim() === "") {
        state = "body";
      }
      continue;
    }
    if (state === "body") {
      if (line.startsWith(PGP_SIG_START)) {
        state = "sig";
        continue;
      }
      // Strip dash-escape prefix (RFC 4880 §7.1)
      bodyLines.push(line.startsWith("- ") ? line.slice(2) : line);
      continue;
    }
    if (state === "sig") {
      if (line.startsWith(PGP_SIG_END)) {
        state = "done";
        continue;
      }
      sigLines.push(line);
    }
  }
  return {
    pgp: {
      signed: true,
      hashAlgorithms,
      signatureBlock: sigLines.join("\n"),
    },
    body: bodyLines.join("\n"),
  };
}
function buildContactField(raw) {
  return {
    type: "contact",
    value: raw.value,
    scheme: getScheme(raw.value),
    lineNumber: raw.lineNumber,
  };
}
function buildExpiresField(raw) {
  return {
    type: "expires",
    value: raw.value,
    date: parseRfc3339(raw.value),
    lineNumber: raw.lineNumber,
  };
}
function buildEncryptionField(raw) {
  return {
    type: "encryption",
    value: raw.value,
    scheme: getScheme(raw.value),
    lineNumber: raw.lineNumber,
  };
}
function buildPreferredLanguagesField(raw) {
  const languages = raw.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return {
    type: "preferred-languages",
    value: raw.value,
    languages,
    lineNumber: raw.lineNumber,
  };
}
function buildSimpleField(raw, type) {
  return { type, value: raw.value, lineNumber: raw.lineNumber };
}
function byteLength(s) {
  return Buffer.byteLength(s, "utf8");
}
export function parse(input, options = {}) {
  const now = options.now ?? new Date();
  const byteCount = byteLength(input);
  const { pgp, body } = options.skipPgpStripping
    ? { pgp: { signed: false, hashAlgorithms: [], signatureBlock: "" }, body: input }
    : stripPgpArmor(input);
  const rawLines = body.split(/\r?\n/);
  const lineCount = rawLines.length;
  const fields = [];
  const parseErrors = [];
  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = rawLines[i];
    // Trim only trailing whitespace for classification; preserve content
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1) {
      parseErrors.push({
        severity: "error",
        code: "INVALID_LINE",
        message: `Line ${lineNumber}: cannot parse '${line}' as a field or comment`,
        lineNumber,
      });
      continue;
    }
    const rawName = line.slice(0, colonIdx);
    if (/\s/.test(rawName)) {
      parseErrors.push({
        severity: "error",
        code: "INVALID_FIELD_FORMAT",
        message: `Line ${lineNumber}: field name '${rawName}' must not contain whitespace`,
        lineNumber,
      });
      continue;
    }
    const rawValue = line.slice(colonIdx + 1).trimStart();
    if (rawValue.length === 0) {
      parseErrors.push({
        severity: "error",
        code: "INVALID_FIELD_FORMAT",
        message: `Line ${lineNumber}: field '${rawName}' is missing a value after the colon`,
        lineNumber,
      });
      continue;
    }
    const raw = { name: rawName, value: rawValue, lineNumber };
    const normalised = rawName.toLowerCase();
    let field;
    switch (normalised) {
      case "contact":
        field = buildContactField(raw);
        break;
      case "expires":
        field = buildExpiresField(raw);
        break;
      case "acknowledgments":
        field = buildSimpleField(raw, "acknowledgments");
        break;
      case "canonical":
        field = buildSimpleField(raw, "canonical");
        break;
      case "encryption":
        field = buildEncryptionField(raw);
        break;
      case "hiring":
        field = buildSimpleField(raw, "hiring");
        break;
      case "policy":
        field = buildSimpleField(raw, "policy");
        break;
      case "preferred-languages":
        field = buildPreferredLanguagesField(raw);
        break;
      default: {
        const ext = {
          type: "extension",
          name: rawName,
          value: rawValue,
          lineNumber,
        };
        field = ext;
      }
    }
    fields.push(field);
  }
  const validationErrors = collectErrors(fields, pgp, byteCount, lineCount, now);
  const recommendations = collectRecommendations(fields, pgp, byteCount, lineCount, now);
  const errors = [...parseErrors, ...validationErrors];
  return {
    contacts: fields.filter((f) => f.type === "contact"),
    expires: fields.find((f) => f.type === "expires") ?? null,
    acknowledgments: fields.filter((f) => f.type === "acknowledgments"),
    canonical: fields.filter((f) => f.type === "canonical"),
    encryption: fields.filter((f) => f.type === "encryption"),
    hiring: fields.filter((f) => f.type === "hiring"),
    policy: fields.filter((f) => f.type === "policy"),
    preferredLanguages: fields.find((f) => f.type === "preferred-languages") ?? null,
    extensions: fields.filter((f) => f.type === "extension"),
    fields,
    errors,
    recommendations,
    pgp,
    isValid: errors.length === 0,
    lineCount,
    byteCount,
  };
}
