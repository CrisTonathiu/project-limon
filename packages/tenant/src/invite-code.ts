/**
 * Invite codes: what a patient types in the shared app to join a tenant.
 *
 * They decide tenant membership at signup, so they must be unguessable: 8 random
 * characters from a 31-symbol alphabet (~8.5 × 10¹¹ codes), with look-alikes
 * (0/O, 1/I/L) removed so they can be read aloud or copied from WhatsApp.
 * Stored and compared in the normalized form below.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Largest multiple of the alphabet size below 256: bytes at or above it are
// rejected so every symbol is equally likely (no modulo bias).
const LIMIT = 256 - (256 % ALPHABET.length);

export function generateInviteCode(): string {
  const out: string[] = [];
  const bytes = new Uint8Array(16);
  while (out.length < 8) {
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < LIMIT && out.length < 8) out.push(ALPHABET[b % ALPHABET.length]!);
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4).join('')}`;
}

/** Case- and whitespace-insensitive, so " abcd-efgh " matches "ABCD-EFGH". */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}
