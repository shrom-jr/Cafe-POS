/**
 * Cryptographic PIN utilities using the Web Crypto API (SHA-256 + random salt).
 *
 * All operations are async by nature of SubtleCrypto, but a single SHA-256
 * digest completes in < 1 ms so there is no perceptible UI lag.
 *
 * Security properties:
 *   • Each PIN gets a unique 16-byte (128-bit) random salt — identical PINs
 *     produce different hashes across users.
 *   • The comparison in verifyPin uses a constant-time loop to prevent trivial
 *     timing-based side-channel leaks.
 */

/**
 * Hash a numeric PIN with an optional salt.
 *
 * When `salt` is omitted a fresh cryptographically-random 32-char hex string
 * (16 bytes) is generated automatically.
 *
 * @returns An object containing the lowercase hex hash and the salt used.
 */
export async function hashPin(
  pin: string,
  salt?: string,
): Promise<{ hash: string; salt: string }> {
  const usedSalt =
    salt ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const encoder = new TextEncoder();
  const data = encoder.encode(usedSalt + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return { hash, salt: usedSalt };
}

/**
 * Verify a candidate PIN against a stored hash + salt pair.
 *
 * Uses a constant-time character-by-character XOR to prevent timing attacks.
 */
export async function verifyPin(
  inputPin: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  const { hash } = await hashPin(inputPin, salt);
  if (hash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}
