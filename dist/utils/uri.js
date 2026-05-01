const OPENPGP4FPR_RE = /^openpgp4fpr:[0-9a-fA-F]{40}$/i;
const DNS_RE = /^dns:/i;
export function getScheme(uri) {
  const colon = uri.indexOf(":");
  if (colon < 1) return "";
  return uri.slice(0, colon).toLowerCase();
}
export function isHttpsUri(uri) {
  return uri.toLowerCase().startsWith("https://");
}
export function isValidUri(uri) {
  try {
    new URL(uri);
    return true;
  } catch {
    return false;
  }
}
export function isValidContactUri(uri) {
  const scheme = getScheme(uri);
  if (scheme === "mailto" || scheme === "tel") return isValidUri(uri);
  if (scheme === "https") return isHttpsUri(uri) && isValidUri(uri);
  return false;
}
export function isWebUri(uri) {
  const scheme = getScheme(uri);
  return scheme === "http" || scheme === "https";
}
export function isValidEncryptionUri(uri) {
  if (OPENPGP4FPR_RE.test(uri)) return true;
  if (DNS_RE.test(uri)) return true;
  if (isHttpsUri(uri)) return isValidUri(uri);
  return false;
}
