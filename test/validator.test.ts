import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";

const FUTURE = new Date("2099-01-01T00:00:00Z");
const NOW = new Date("2026-04-26T00:00:00Z");

function build(lines: string[], now = FUTURE): ReturnType<typeof parse> {
  return parse(lines.join("\n"), { now });
}

// ── Error codes ──────────────────────────────────────────────────────────────

describe("MISSING_CONTACT", () => {
  it("fires when no Contact field present", () => {
    const r = build(["Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "MISSING_CONTACT")).toBe(true);
  });
});

describe("MISSING_EXPIRES", () => {
  it("fires when no Expires field present", () => {
    const r = build(["Contact: mailto:a@b.com"]);
    expect(r.errors.some((e) => e.code === "MISSING_EXPIRES")).toBe(true);
  });
});

describe("MULTIPLE_EXPIRES", () => {
  it("fires on second Expires occurrence with correct lineNumber", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Expires: 2098-01-01T00:00:00Z",
    ]);
    const d = r.errors.find((e) => e.code === "MULTIPLE_EXPIRES");
    expect(d).toBeDefined();
    expect(d?.lineNumber).toBe(3);
  });
});

describe("MULTIPLE_PREFERRED_LANGUAGES", () => {
  it("fires on second Preferred-Languages occurrence", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Preferred-Languages: en",
      "Preferred-Languages: es",
    ]);
    const d = r.errors.find((e) => e.code === "MULTIPLE_PREFERRED_LANGUAGES");
    expect(d).toBeDefined();
    expect(d?.lineNumber).toBe(4);
  });
});

describe("EXPIRES_INVALID", () => {
  it("fires for a non-RFC-3339 date string", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: not-a-date"]);
    expect(r.errors.some((e) => e.code === "EXPIRES_INVALID")).toBe(true);
  });

  it("fires for local time without timezone offset", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: 2099-01-01T00:00:00"]);
    expect(r.errors.some((e) => e.code === "EXPIRES_INVALID")).toBe(true);
  });

  it("fires for a string with a valid offset suffix but unparseable date", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: not-a-date+00:00"]);
    expect(r.errors.some((e) => e.code === "EXPIRES_INVALID")).toBe(true);
  });
});

describe("EXPIRES_IN_PAST", () => {
  it("fires when Expires date is in the past relative to now", () => {
    const r = parse("Contact: mailto:a@b.com\nExpires: 2020-01-01T00:00:00Z\n", { now: NOW });
    expect(r.errors.some((e) => e.code === "EXPIRES_IN_PAST")).toBe(true);
  });

  it("does not fire when Expires is in the future", () => {
    const r = parse("Contact: mailto:a@b.com\nExpires: 2030-01-01T00:00:00Z\n", { now: NOW });
    expect(r.errors.some((e) => e.code === "EXPIRES_IN_PAST")).toBe(false);
  });
});

describe("CONTACT_INVALID_URI", () => {
  it("fires for an unrecognised scheme", () => {
    const r = build(["Contact: ftp://example.com", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "CONTACT_INVALID_URI")).toBe(true);
  });

  it("fires for a value with no scheme at all", () => {
    const r = build(["Contact: justaplainstring", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "CONTACT_INVALID_URI")).toBe(true);
  });

  it("does not fire for mailto:", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "CONTACT_INVALID_URI")).toBe(false);
  });

  it("does not fire for tel:", () => {
    const r = build(["Contact: tel:+1-555-0100", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "CONTACT_INVALID_URI")).toBe(false);
  });
});

describe("CONTACT_WEB_NOT_HTTPS", () => {
  it("fires for http:// Contact", () => {
    const r = build(["Contact: http://example.com/report", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "CONTACT_WEB_NOT_HTTPS")).toBe(true);
  });

  it("fires for a structurally invalid https:// Contact URI", () => {
    const r = build(["Contact: https://[::invalid", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "CONTACT_WEB_NOT_HTTPS")).toBe(true);
  });

  it("does not fire for https:// Contact", () => {
    const r = build(["Contact: https://example.com/report", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "CONTACT_WEB_NOT_HTTPS")).toBe(false);
  });
});

describe("ACKNOWLEDGMENTS_NOT_HTTPS", () => {
  it("fires for http:// Acknowledgments", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Acknowledgments: http://example.com/thanks",
    ]);
    expect(r.errors.some((e) => e.code === "ACKNOWLEDGMENTS_NOT_HTTPS")).toBe(true);
  });
});

describe("CANONICAL_NOT_HTTPS", () => {
  it("fires for http:// Canonical", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Canonical: http://example.com/.well-known/security.txt",
    ]);
    expect(r.errors.some((e) => e.code === "CANONICAL_NOT_HTTPS")).toBe(true);
  });
});

describe("ENCRYPTION_INVALID_URI", () => {
  it("fires for an invalid Encryption scheme", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Encryption: ftp://example.com/key",
    ]);
    expect(r.errors.some((e) => e.code === "ENCRYPTION_INVALID_URI")).toBe(true);
  });

  it("does not fire for openpgp4fpr: with 40 hex chars", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Encryption: openpgp4fpr:5f2de5521c63a801ab59ccb603d49de44b29100f",
    ]);
    expect(r.errors.some((e) => e.code === "ENCRYPTION_INVALID_URI")).toBe(false);
  });

  it("does not fire for dns: URI", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Encryption: dns:5d2d37ab._openpgpkey.example.com?type=OPENPGPKEY",
    ]);
    expect(r.errors.some((e) => e.code === "ENCRYPTION_INVALID_URI")).toBe(false);
  });
});

describe("ENCRYPTION_WEB_NOT_HTTPS", () => {
  it("fires for http:// Encryption URI", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Encryption: http://example.com/key.txt",
    ]);
    expect(r.errors.some((e) => e.code === "ENCRYPTION_WEB_NOT_HTTPS")).toBe(true);
  });
});

describe("HIRING_NOT_HTTPS", () => {
  it("fires for http:// Hiring", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Hiring: http://example.com/jobs",
    ]);
    expect(r.errors.some((e) => e.code === "HIRING_NOT_HTTPS")).toBe(true);
  });
});

describe("POLICY_NOT_HTTPS", () => {
  it("fires for http:// Policy", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Policy: http://example.com/policy",
    ]);
    expect(r.errors.some((e) => e.code === "POLICY_NOT_HTTPS")).toBe(true);
  });
});

describe("PREFERRED_LANGUAGES_EMPTY", () => {
  it("fires when Preferred-Languages value is blank/comma-only", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Preferred-Languages: ,  ,",
    ]);
    expect(r.errors.some((e) => e.code === "PREFERRED_LANGUAGES_EMPTY")).toBe(true);
  });
});

describe("PREFERRED_LANGUAGES_INVALID_TAG", () => {
  it("fires for a tag that fails RFC 5646 syntax", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Preferred-Languages: en, 123invalid",
    ]);
    expect(r.errors.some((e) => e.code === "PREFERRED_LANGUAGES_INVALID_TAG")).toBe(true);
  });

  it("does not fire for valid tags", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Preferred-Languages: en, zh-Hant-TW, es",
    ]);
    expect(r.errors.some((e) => e.code === "PREFERRED_LANGUAGES_INVALID_TAG")).toBe(false);
  });
});

describe("INVALID_LINE", () => {
  it("fires for a line that is not a field or comment", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "this is garbage",
    ]);
    expect(r.errors.some((e) => e.code === "INVALID_LINE")).toBe(true);
  });
});

describe("INVALID_FIELD_FORMAT", () => {
  it("fires when a field has no value after the colon", () => {
    const r = build(["Contact:", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.errors.some((e) => e.code === "INVALID_FIELD_FORMAT")).toBe(true);
  });

  it("fires when a field name contains whitespace", () => {
    const r = build([
      "Bad Name: value",
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
    ]);
    expect(r.errors.some((e) => e.code === "INVALID_FIELD_FORMAT")).toBe(true);
  });
});

// ── Recommendation codes ─────────────────────────────────────────────────────

describe("EXPIRES_MORE_THAN_ONE_YEAR", () => {
  it("fires when Expires is more than 1 year ahead", () => {
    const r = parse("Contact: mailto:a@b.com\nExpires: 2030-01-01T00:00:00Z\n", { now: NOW });
    expect(r.recommendations.some((r) => r.code === "EXPIRES_MORE_THAN_ONE_YEAR")).toBe(true);
  });

  it("does not fire when Expires is within 1 year", () => {
    const sixMonths = new Date(NOW);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    const iso = sixMonths.toISOString().replace(/\.\d{3}Z$/, "Z");
    const r = parse(`Contact: mailto:a@b.com\nExpires: ${iso}\n`, { now: NOW });
    expect(r.recommendations.some((r) => r.code === "EXPIRES_MORE_THAN_ONE_YEAR")).toBe(false);
  });
});

describe("EXPIRES_SOON", () => {
  it("fires when Expires is within 14 days", () => {
    const soon = new Date(NOW);
    soon.setDate(soon.getDate() + 7);
    const iso = soon.toISOString().replace(/\.\d{3}Z$/, "Z");
    const r = parse(`Contact: mailto:a@b.com\nExpires: ${iso}\n`, { now: NOW });
    expect(r.recommendations.some((r) => r.code === "EXPIRES_SOON")).toBe(true);
  });

  it("does not fire when Expires is more than 14 days away", () => {
    const later = new Date(NOW);
    later.setDate(later.getDate() + 30);
    const iso = later.toISOString().replace(/\.\d{3}Z$/, "Z");
    const r = parse(`Contact: mailto:a@b.com\nExpires: ${iso}\n`, { now: NOW });
    expect(r.recommendations.some((r) => r.code === "EXPIRES_SOON")).toBe(false);
  });
});

describe("NOT_SIGNED", () => {
  it("fires when file is not PGP signed", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.recommendations.some((r) => r.code === "NOT_SIGNED")).toBe(true);
  });
});

describe("SIGNED_WITHOUT_CANONICAL", () => {
  it("fires when signed but no Canonical field", () => {
    const input = [
      "-----BEGIN PGP SIGNED MESSAGE-----",
      "Hash: SHA256",
      "",
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "-----BEGIN PGP SIGNATURE-----",
      "",
      "fakesig",
      "-----END PGP SIGNATURE-----",
    ].join("\n");
    const r = parse(input, { now: FUTURE });
    expect(r.recommendations.some((r) => r.code === "SIGNED_WITHOUT_CANONICAL")).toBe(true);
  });
});

describe("NO_CANONICAL", () => {
  it("fires when no Canonical field", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.recommendations.some((r) => r.code === "NO_CANONICAL")).toBe(true);
  });

  it("does not fire when Canonical is present", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Canonical: https://example.com/.well-known/security.txt",
    ]);
    expect(r.recommendations.some((r) => r.code === "NO_CANONICAL")).toBe(false);
  });
});

describe("CONTACT_NO_ENCRYPTION", () => {
  it("fires when mailto: Contact present but no Encryption", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.recommendations.some((r) => r.code === "CONTACT_NO_ENCRYPTION")).toBe(true);
  });

  it("does not fire when Encryption is provided", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Encryption: https://example.com/pgp-key.txt",
    ]);
    expect(r.recommendations.some((r) => r.code === "CONTACT_NO_ENCRYPTION")).toBe(false);
  });

  it("does not fire when Contact is not mailto:", () => {
    const r = build(["Contact: https://example.com/report", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.recommendations.some((r) => r.code === "CONTACT_NO_ENCRYPTION")).toBe(false);
  });
});

describe("NO_POLICY", () => {
  it("fires when no Policy field", () => {
    const r = build(["Contact: mailto:a@b.com", "Expires: 2099-01-01T00:00:00Z"]);
    expect(r.recommendations.some((r) => r.code === "NO_POLICY")).toBe(true);
  });

  it("does not fire when Policy is present", () => {
    const r = build([
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Policy: https://example.com/policy",
    ]);
    expect(r.recommendations.some((r) => r.code === "NO_POLICY")).toBe(false);
  });
});

describe("FILE_TOO_LARGE", () => {
  it("fires when input exceeds 32 KB", () => {
    const padding = "X".repeat(33 * 1024);
    const input = `Contact: mailto:a@b.com\nExpires: 2099-01-01T00:00:00Z\n# ${padding}\n`;
    const r = parse(input, { now: FUTURE });
    expect(r.recommendations.some((r) => r.code === "FILE_TOO_LARGE")).toBe(true);
  });
});

describe("TOO_MANY_LINES", () => {
  it("fires when line count exceeds 1000", () => {
    const comments = Array.from({ length: 1001 }, (_, i) => `# line ${i}`).join("\n");
    const input = `Contact: mailto:a@b.com\nExpires: 2099-01-01T00:00:00Z\n${comments}\n`;
    const r = parse(input, { now: FUTURE });
    expect(r.recommendations.some((r) => r.code === "TOO_MANY_LINES")).toBe(true);
  });
});

describe("FIELD_TOO_LONG", () => {
  it("fires when a field value exceeds 2048 characters", () => {
    const longValue = "https://example.com/" + "a".repeat(2050);
    const input = `Contact: ${longValue}\nExpires: 2099-01-01T00:00:00Z\n`;
    const r = parse(input, { now: FUTURE });
    expect(r.recommendations.some((r) => r.code === "FIELD_TOO_LONG")).toBe(true);
  });

  it("fires for an extension field value exceeding 2048 characters", () => {
    const longValue = "a".repeat(2049);
    const input = `Contact: mailto:a@b.com\nExpires: 2099-01-01T00:00:00Z\nX-Custom: ${longValue}\n`;
    const r = parse(input, { now: FUTURE });
    const d = r.recommendations.find((r) => r.code === "FIELD_TOO_LONG");
    expect(d).toBeDefined();
    expect(d?.message).toContain("X-Custom");
  });

  it("does not fire for values exactly at 2048 characters", () => {
    const longValue = "https://example.com/" + "a".repeat(2028); // 20 + 2028 = 2048
    const input = `Contact: ${longValue}\nExpires: 2099-01-01T00:00:00Z\n`;
    const r = parse(input, { now: FUTURE });
    expect(r.recommendations.some((r) => r.code === "FIELD_TOO_LONG")).toBe(false);
  });
});
