const LANG_TAG_RE = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/;

export function isValidLanguageTag(tag: string): boolean {
  return LANG_TAG_RE.test(tag.trim());
}
