/**
 * Zero-Knowledge Encryption Utilities
 * Uses Web Crypto API (AES-256-GCM and PBKDF2)
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 256;
const DIGEST = "SHA-256";

/**
 * Derives a cryptographic key from a password and salt using PBKDF2.
 * The salt string can be a uuid (dashes will be stripped to form proper hex).
 */
export async function deriveKey(password: string, saltString: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const cleanSalt = saltString.replace(/-/g, '').padStart(32, '0');
  const salt = new Uint8Array(cleanSalt.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATIONS,
      hash: DIGEST,
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a string using AES-256-GCM.
 * Returns the ciphertext and IV as base64 strings.
 */
export async function encryptData(text: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    enc.encode(text)
  );

  const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return { ciphertext: ciphertextBase64, iv: ivBase64 };
}

/**
 * Decrypts a base64 ciphertext and IV using AES-256-GCM.
 */
export async function decryptData(ciphertextBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
  const ciphertext = new Uint8Array(atob(ciphertextBase64).split("").map((c) => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(ivBase64).split("").map((c) => c.charCodeAt(0)));

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}
