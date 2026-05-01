import { isExpired, isMoreThanOneYearAhead, daysUntil } from "./utils/datetime.js";
import { isHttpsUri, isValidContactUri, isValidEncryptionUri, isWebUri } from "./utils/uri.js";
import { isValidLanguageTag } from "./utils/language-tag.js";
function err(code, message, lineNumber) {
  return { severity: "error", code, message, ...(lineNumber !== undefined ? { lineNumber } : {}) };
}
function rec(code, message, lineNumber) {
  return {
    severity: "recommendation",
    code,
    message,
    ...(lineNumber !== undefined ? { lineNumber } : {}),
  };
}
export function collectErrors(fields, _pgp, _byteCount, _lineCount, now) {
  const diagnostics = [];
  const contacts = fields.filter((f) => f.type === "contact");
  const expiresFields = fields.filter((f) => f.type === "expires");
  const preferredLangsFields = fields.filter((f) => f.type === "preferred-languages");
  if (contacts.length === 0) {
    diagnostics.push(
      err("MISSING_CONTACT", "At least one Contact field is required (RFC 9116 §2.5.3)"),
    );
  }
  if (expiresFields.length === 0) {
    diagnostics.push(err("MISSING_EXPIRES", "The Expires field is required (RFC 9116 §2.5.5)"));
  }
  if (expiresFields.length > 1) {
    const second = expiresFields[1];
    diagnostics.push(
      err(
        "MULTIPLE_EXPIRES",
        "The Expires field MUST NOT appear more than once (RFC 9116 §2.5.5)",
        second.lineNumber,
      ),
    );
  }
  if (preferredLangsFields.length > 1) {
    const second = preferredLangsFields[1];
    diagnostics.push(
      err(
        "MULTIPLE_PREFERRED_LANGUAGES",
        "The Preferred-Languages field MUST NOT appear more than once (RFC 9116 §2.5.8)",
        second.lineNumber,
      ),
    );
  }
  // Expires value checks (only look at the first one; duplicate is already flagged)
  const expires = expiresFields[0];
  if (expires !== undefined) {
    if (expires.date === null) {
      diagnostics.push(
        err(
          "EXPIRES_INVALID",
          `The Expires value '${expires.value}' is not a valid RFC 3339 date-time`,
          expires.lineNumber,
        ),
      );
    } else if (isExpired(expires.date, now)) {
      diagnostics.push(
        err(
          "EXPIRES_IN_PAST",
          "The Expires date is in the past; this file MUST NOT be used (RFC 9116 §2.5.5)",
          expires.lineNumber,
        ),
      );
    }
  }
  // Contact URI validation
  for (const contact of contacts) {
    if (!isValidContactUri(contact.value)) {
      if (isWebUri(contact.value)) {
        diagnostics.push(
          err(
            "CONTACT_WEB_NOT_HTTPS",
            `Contact web URIs must use https:// (RFC 9116 §2.5.3)`,
            contact.lineNumber,
          ),
        );
      } else {
        diagnostics.push(
          err(
            "CONTACT_INVALID_URI",
            `Contact value '${contact.value}' must be a valid URI (mailto:, tel:, https://) (RFC 9116 §2.5.3)`,
            contact.lineNumber,
          ),
        );
      }
    }
  }
  // Per-field URI checks
  for (const field of fields) {
    if (field.type === "acknowledgments") {
      if (!isHttpsUri(field.value)) {
        diagnostics.push(
          err(
            "ACKNOWLEDGMENTS_NOT_HTTPS",
            "Acknowledgments must use https:// (RFC 9116 §2.5.1)",
            field.lineNumber,
          ),
        );
      }
    } else if (field.type === "canonical") {
      if (!isHttpsUri(field.value)) {
        diagnostics.push(
          err(
            "CANONICAL_NOT_HTTPS",
            "Canonical must use https:// (RFC 9116 §2.5.2)",
            field.lineNumber,
          ),
        );
      }
    } else if (field.type === "encryption") {
      const enc = field;
      if (!isValidEncryptionUri(enc.value)) {
        if (isWebUri(enc.value)) {
          diagnostics.push(
            err(
              "ENCRYPTION_WEB_NOT_HTTPS",
              "Encryption web URIs must use https:// (RFC 9116 §2.5.4)",
              enc.lineNumber,
            ),
          );
        } else {
          diagnostics.push(
            err(
              "ENCRYPTION_INVALID_URI",
              `Encryption must be an https://, dns:, or openpgp4fpr: URI (RFC 9116 §2.5.4)`,
              enc.lineNumber,
            ),
          );
        }
      }
    } else if (field.type === "hiring") {
      if (!isHttpsUri(field.value)) {
        diagnostics.push(
          err("HIRING_NOT_HTTPS", "Hiring must use https:// (RFC 9116 §2.5.6)", field.lineNumber),
        );
      }
    } else if (field.type === "policy") {
      if (!isHttpsUri(field.value)) {
        diagnostics.push(
          err("POLICY_NOT_HTTPS", "Policy must use https:// (RFC 9116 §2.5.7)", field.lineNumber),
        );
      }
    } else if (field.type === "preferred-languages") {
      const pl = field;
      if (pl.languages.length === 0) {
        diagnostics.push(
          err(
            "PREFERRED_LANGUAGES_EMPTY",
            "Preferred-Languages must contain at least one language tag (RFC 9116 §2.5.8)",
            pl.lineNumber,
          ),
        );
      } else {
        for (const tag of pl.languages) {
          if (!isValidLanguageTag(tag)) {
            diagnostics.push(
              err(
                "PREFERRED_LANGUAGES_INVALID_TAG",
                `'${tag}' is not a valid RFC 5646 language tag`,
                pl.lineNumber,
              ),
            );
          }
        }
      }
    }
  }
  return diagnostics;
}
export function collectRecommendations(fields, pgp, byteCount, lineCount, now) {
  const diagnostics = [];
  const contacts = fields.filter((f) => f.type === "contact");
  const expiresFields = fields.filter((f) => f.type === "expires");
  const canonical = fields.filter((f) => f.type === "canonical");
  const encryption = fields.filter((f) => f.type === "encryption");
  const policy = fields.filter((f) => f.type === "policy");
  // Expires recommendations
  const expires = expiresFields[0];
  if (expires?.date !== null && expires?.date !== undefined) {
    if (isMoreThanOneYearAhead(expires.date, now)) {
      diagnostics.push(
        rec(
          "EXPIRES_MORE_THAN_ONE_YEAR",
          "It is recommended that Expires be less than one year in the future (RFC 9116 §2.5.5)",
          expires.lineNumber,
        ),
      );
    }
    const days = daysUntil(expires.date, now);
    if (days >= 0 && days <= 14) {
      diagnostics.push(
        rec(
          "EXPIRES_SOON",
          `The file expires soon (${days} days). Consider updating it.`,
          expires.lineNumber,
        ),
      );
    }
  }
  if (!pgp.signed) {
    diagnostics.push(
      rec(
        "NOT_SIGNED",
        "It is recommended to digitally sign security.txt with OpenPGP (RFC 9116 §2.3)",
      ),
    );
  }
  if (pgp.signed && canonical.length === 0) {
    diagnostics.push(
      rec(
        "SIGNED_WITHOUT_CANONICAL",
        "Signed files should include a Canonical field to authenticate the file's location (RFC 9116 §2.3)",
      ),
    );
  }
  if (canonical.length === 0) {
    diagnostics.push(
      rec(
        "NO_CANONICAL",
        "Consider adding a Canonical field, especially when signing the file (RFC 9116 §2.5.2)",
      ),
    );
  }
  const hasMailtoContact = contacts.some((c) => c.scheme === "mailto");
  if (hasMailtoContact && encryption.length === 0) {
    diagnostics.push(
      rec(
        "CONTACT_NO_ENCRYPTION",
        "When email Contact is used, encryption is recommended (RFC 9116 §2.5.3)",
      ),
    );
  }
  if (policy.length === 0) {
    diagnostics.push(
      rec(
        "NO_POLICY",
        "Consider adding a Policy field to document your vulnerability disclosure process (RFC 9116 §3.1)",
      ),
    );
  }
  if (byteCount > 32 * 1024) {
    diagnostics.push(
      rec("FILE_TOO_LARGE", "File size exceeds the recommended 32 KB limit (RFC 9116 §5.4)"),
    );
  }
  if (lineCount > 1000) {
    diagnostics.push(
      rec("TOO_MANY_LINES", "File exceeds the recommended 1,000-line limit (RFC 9116 §5.4)"),
    );
  }
  for (const field of fields) {
    const value = field.type === "extension" ? field.value : field.value;
    if (value.length > 2048) {
      const name = field.type === "extension" ? field.name : field.type;
      diagnostics.push(
        rec(
          "FIELD_TOO_LONG",
          `Field '${name}' on line ${field.lineNumber} exceeds the recommended 2,048-character limit (RFC 9116 §5.4)`,
          field.lineNumber,
        ),
      );
    }
  }
  return diagnostics;
}
