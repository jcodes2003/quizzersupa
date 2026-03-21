import { createHmac } from "crypto";

const SECTION_JOIN_SECRET =
  process.env.SECTION_JOIN_SECRET ?? "quizmake-section-join-secret-32chars";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, avoids 0/1/I/O confusion

function base32FromBytes(bytes: Uint8Array, length: number): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      bits -= 5;
      const idx = (buffer >> bits) & 31;
      out += CODE_ALPHABET[idx]!;
    }
    if (out.length >= length) break;
  }
  if (out.length < length && bits > 0) {
    const idx = (buffer << (5 - bits)) & 31;
    out += CODE_ALPHABET[idx]!;
  }
  return out.slice(0, length);
}

export function getSectionJoinCode(sectionId: string, length = 8): string {
  const raw = String(sectionId ?? "").trim();
  const digest = createHmac("sha256", SECTION_JOIN_SECRET).update(raw).digest();
  return base32FromBytes(digest, length);
}

export function normalizeJoinCode(input: string): string {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

