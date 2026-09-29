// ZNS v1 identifiers: the SDK accepts 1–62 lowercase ASCII letters/digits.
// Kept dependency-free for the HTTP boundary; parity is tested against the SDK.
export const isValidName = (name: string): boolean => /^[a-z0-9]{1,62}$/.test(name);

export function normalizeName(raw: string): string {
  try { return decodeURIComponent(raw).toLowerCase(); }
  catch { return raw.toLowerCase(); }
}
