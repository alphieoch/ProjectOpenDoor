import { createHash } from "crypto";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;

function key() {
  const envKey =
    process.env.API_SECRET_KEY ||
    process.env.AUTH_SECRET ||
    "opendoor-default-secret-change-me";
  return createHash("sha256").update(envKey).digest();
}

export function encryptAgentSecret(plaintext: string) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptAgentSecret(encrypted: { ciphertext: string; iv: string; tag: string }) {
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf-8");
}
