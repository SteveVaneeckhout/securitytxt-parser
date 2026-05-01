import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

const FUTURE = new Date("2099-01-01T00:00:00Z");

describe("parse() — happy path (unsigned)", () => {
  it("parses a minimal valid file without errors", () => {
    const result = parse(fixture("valid-unsigned.txt"), { now: FUTURE });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]?.value).toBe("mailto:security@example.com");
    expect(result.expires).not.toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.isValid).toBe(true);
  });

  it("parses all fields correctly", () => {
    const result = parse(fixture("all-fields.txt"), { now: FUTURE });
    expect(result.contacts).toHaveLength(2);
    expect(result.acknowledgments).toHaveLength(1);
    expect(result.canonical).toHaveLength(1);
    expect(result.encryption).toHaveLength(1);
    expect(result.hiring).toHaveLength(1);
    expect(result.policy).toHaveLength(1);
    expect(result.preferredLanguages).not.toBeNull();
    expect(result.preferredLanguages?.languages).toEqual(["en", "es", "fr"]);
  });

  it("reports NOT_SIGNED and NO_CANONICAL and NO_POLICY recommendations for unsigned file", () => {
    const result = parse(fixture("valid-unsigned.txt"), { now: FUTURE });
    const codes = result.recommendations.map((r) => r.code);
    expect(codes).toContain("NOT_SIGNED");
    expect(codes).toContain("NO_CANONICAL");
    expect(codes).toContain("NO_POLICY");
  });
});

describe("parse() — PGP signed file", () => {
  it("detects PGP signature", () => {
    const result = parse(fixture("valid-signed.txt"), { now: FUTURE });
    expect(result.pgp.signed).toBe(true);
    expect(result.pgp.hashAlgorithms).toContain("SHA256");
  });

  it("still parses fields correctly from signed body", () => {
    const result = parse(fixture("valid-signed.txt"), { now: FUTURE });
    expect(result.contacts).toHaveLength(1);
    expect(result.expires).not.toBeNull();
  });

  it("does not emit NOT_SIGNED recommendation", () => {
    const result = parse(fixture("valid-signed.txt"), { now: FUTURE });
    const codes = result.recommendations.map((r) => r.code);
    expect(codes).not.toContain("NOT_SIGNED");
  });

  it("emits SIGNED_WITHOUT_CANONICAL when signed but no Canonical", () => {
    const result = parse(fixture("valid-signed.txt"), { now: FUTURE });
    const codes = result.recommendations.map((r) => r.code);
    expect(codes).toContain("SIGNED_WITHOUT_CANONICAL");
  });
});

describe("parse() — empty / comment-only input", () => {
  it("returns MISSING_CONTACT and MISSING_EXPIRES for empty input", () => {
    const result = parse("", { now: FUTURE });
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("MISSING_CONTACT");
    expect(codes).toContain("MISSING_EXPIRES");
    expect(result.isValid).toBe(false);
  });

  it("returns errors for comment-only input", () => {
    const result = parse("# Just a comment\n# Another comment\n", { now: FUTURE });
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("MISSING_CONTACT");
    expect(codes).toContain("MISSING_EXPIRES");
  });
});

describe("parse() — line ending handling", () => {
  const crlf = "Contact: mailto:a@b.com\r\nExpires: 2099-12-31T23:59:59Z\r\n";
  const lf = "Contact: mailto:a@b.com\nExpires: 2099-12-31T23:59:59Z\n";

  it("parses CRLF files", () => {
    const result = parse(crlf, { now: FUTURE });
    expect(result.contacts[0]?.value).toBe("mailto:a@b.com");
    expect(result.errors.filter((e) => e.code !== "NOT_SIGNED")).toHaveLength(0);
  });

  it("parses LF files identically", () => {
    const result = parse(lf, { now: FUTURE });
    expect(result.contacts[0]?.value).toBe("mailto:a@b.com");
  });
});

describe("parse() — case-insensitive field names", () => {
  it("treats CONTACT, Contact, contact identically", () => {
    const input = "CONTACT: mailto:a@b.com\nExpires: 2099-01-01T00:00:00Z\n";
    const result = parse(input, { now: FUTURE });
    expect(result.contacts).toHaveLength(1);
  });

  it("treats EXPIRES and expires identically", () => {
    const input = "Contact: mailto:a@b.com\nEXPIRES: 2099-01-01T00:00:00Z\n";
    const result = parse(input, { now: FUTURE });
    expect(result.expires).not.toBeNull();
  });
});

describe("parse() — multiple values", () => {
  it("collects multiple Contact fields in document order", () => {
    const input = [
      "Contact: mailto:a@b.com",
      "Contact: https://example.com/security",
      "Contact: tel:+1-555-0100",
      "Expires: 2099-01-01T00:00:00Z",
    ].join("\n");
    const result = parse(input, { now: FUTURE });
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts[0]?.scheme).toBe("mailto");
    expect(result.contacts[1]?.scheme).toBe("https");
    expect(result.contacts[2]?.scheme).toBe("tel");
  });

  it("emits MULTIPLE_EXPIRES for two Expires fields", () => {
    const input = [
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Expires: 2098-01-01T00:00:00Z",
    ].join("\n");
    const result = parse(input, { now: FUTURE });
    expect(result.errors.some((e) => e.code === "MULTIPLE_EXPIRES")).toBe(true);
    const dup = result.errors.find((e) => e.code === "MULTIPLE_EXPIRES");
    expect(dup?.lineNumber).toBe(3);
  });

  it("emits MULTIPLE_PREFERRED_LANGUAGES", () => {
    const input = [
      "Contact: mailto:a@b.com",
      "Expires: 2099-01-01T00:00:00Z",
      "Preferred-Languages: en",
      "Preferred-Languages: es",
    ].join("\n");
    const result = parse(input, { now: FUTURE });
    expect(result.errors.some((e) => e.code === "MULTIPLE_PREFERRED_LANGUAGES")).toBe(true);
  });
});

describe("parse() — extension fields", () => {
  it("collects unknown fields as extensions without error", () => {
    const result = parse(fixture("extension-fields.txt"), { now: FUTURE });
    expect(result.extensions).toHaveLength(2);
    expect(result.extensions[0]?.name).toBe("X-Team");
    expect(result.extensions[1]?.name).toBe("X-Bug-Bounty");
    expect(result.errors.filter((e) => e.code === "MISSING_CONTACT")).toHaveLength(0);
  });
});

describe("parse() — field values containing colons", () => {
  it("only splits on the first colon", () => {
    const input = "Contact: https://example.com/path?a=1&b=2\nExpires: 2099-01-01T00:00:00Z\n";
    const result = parse(input, { now: FUTURE });
    expect(result.contacts[0]?.value).toBe("https://example.com/path?a=1&b=2");
  });
});

describe("parse() — byteCount and lineCount", () => {
  it("counts lines correctly", () => {
    const input = "Contact: mailto:a@b.com\nExpires: 2099-01-01T00:00:00Z\n";
    const result = parse(input, { now: FUTURE });
    // 3 lines: 2 fields + trailing empty after final \n
    expect(result.lineCount).toBe(3);
  });

  it("counts bytes correctly for ASCII", () => {
    const input = "Contact: mailto:a@b.com\n";
    const result = parse(input, { now: FUTURE });
    expect(result.byteCount).toBe(Buffer.byteLength(input, "utf8"));
  });
});

describe("parse() — default options", () => {
  it("uses current time when now is not provided", () => {
    const input = "Contact: mailto:a@b.com\nExpires: 2020-01-01T00:00:00Z\n";
    const result = parse(input);
    expect(result.errors.some((e) => e.code === "EXPIRES_IN_PAST")).toBe(true);
  });
});

describe("parse() — skipPgpStripping option", () => {
  it("treats the input as plain text without attempting PGP detection", () => {
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
    const result = parse(input, { skipPgpStripping: true, now: FUTURE });
    expect(result.pgp.signed).toBe(false);
    // PGP armor lines are treated as plain text — Contact field is still parsed
    expect(result.contacts).toHaveLength(1);
  });
});

describe("parse() — dash-escaped lines in PGP body", () => {
  it("strips dash-escape prefix from lines inside PGP body", () => {
    const input = [
      "-----BEGIN PGP SIGNED MESSAGE-----",
      "Hash: SHA256",
      "",
      "- Contact: mailto:escaped@example.com",
      "Expires: 2099-01-01T00:00:00Z",
      "-----BEGIN PGP SIGNATURE-----",
      "",
      "fakesig",
      "-----END PGP SIGNATURE-----",
    ].join("\n");
    const result = parse(input, { now: FUTURE });
    expect(result.contacts[0]?.value).toBe("mailto:escaped@example.com");
  });
});
