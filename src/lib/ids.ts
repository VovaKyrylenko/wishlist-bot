import { randomBytes } from "node:crypto";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Short, URL/callback_data-safe random slug (e.g. for wishlist deep links). */
export function generateSlug(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
