/** railway-service crypto.ts ile uyumlu AES-256-GCM (v1:iv:tag:ciphertext). */

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function decryptCredential(blob: string, secret: string): Promise<string> {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid credential blob format");
  }
  const iv = base64ToBytes(parts[1]);
  const tag = base64ToBytes(parts[2]);
  const ciphertext = base64ToBytes(parts[3]);
  const key = await deriveAesKey(secret);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined);
  return new TextDecoder().decode(plain);
}

export async function encryptCredential(plaintext: string, secret: string): Promise<string> {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const combined = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  );
  const tagLen = 16;
  const tag = combined.slice(combined.length - tagLen);
  const ciphertext = combined.slice(0, combined.length - tagLen);
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(tag)}:${bytesToBase64(ciphertext)}`;
}
