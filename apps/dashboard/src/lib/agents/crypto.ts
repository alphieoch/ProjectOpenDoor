import crypto from "crypto";
import type { EncryptedSecret } from "@/lib/api-connections/crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;

function getKey(): Buffer {
  const envKey = process.env.API_SECRET_KEY || process.env.AUTH_SECRET || "";
  const fallback = "opendoor-default-secret-change-me";
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    (!envKey || envKey === fallback || envKey.length < 16)
  ) {
    throw new Error("API_SECRET_KEY or AUTH_SECRET must be set to a unique value in production");
  }
  return crypto.createHash("sha256").update(envKey || fallback).digest();
}

export function encryptAgentSecret(plaintext: string): EncryptedSecret {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptAgentSecret(encrypted: EncryptedSecret): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf-8");
}
