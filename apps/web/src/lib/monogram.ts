/**
 * Single-character monogram for a company avatar. Never returns half a
 * surrogate pair: indexing a string that starts with an emoji (e.g. a site
 * name like "🥽 Plastic Labs") yields an invalid lone surrogate, which the
 * server serializes as U+FFFD while the client keeps the raw code unit — a
 * guaranteed hydration mismatch.
 */
export function monogram(name: string): string {
  const trimmed = name.trim();
  const letterOrDigit = trimmed.match(/[\p{L}\p{N}]/u);
  if (letterOrDigit) return letterOrDigit[0].toUpperCase();
  const [first] = trimmed; // for-of/spread iterate code points, not units
  return first ?? "?";
}
