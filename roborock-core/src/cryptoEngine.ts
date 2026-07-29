/**
 * cryptoEngine — motor criptográfico del protocolo Roborock.
 *
 * Portado de ioBroker.roborock (`src/lib/cryptoEngine.ts`).
 * Ver PROTOCOLO_ROBOROCK.md §4 para la especificación.
 *
 * Para el Qrevo S5V (protocolo V1) solo hacen falta encodeTimestamp + encryptV1/decryptV1
 * y deriveMqttCredentials. El resto (A01/B01/L01) se incluye para compatibilidad con
 * otros modelos. RSA (fotos de cámara) se deja para más adelante.
 */
import { crypto } from "./cryptoProvider";

// Sales extraídas de librrcodec.so (ver documento técnico §1)
export const SALT = "TXdfu$jyZ#TZHsg4";
export const SALT_B01 = "5wwh9ikChRjASpMU8cxg7o1d2E";
export const A01_IV_SEED = "726f626f726f636b2d67a6d6da";

// ---------------------------------------------------------------------------
// Utilidades base
// ---------------------------------------------------------------------------

function toBuffer(input: string | Buffer): Buffer {
  return Buffer.isBuffer(input) ? input : Buffer.from(input, "utf-8");
}

export function md5bin(input: string | Buffer): Buffer {
  return crypto.createHash("md5").update(input).digest();
}

export function md5hex(input: string | Buffer): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Reordena los 8 dígitos hex del timestamp según el patrón fijo de Roborock.
 * Ej.: ts = 0x12345678 -> "12345678" -> "67482315".
 */
export function encodeTimestamp(ts: number): string {
  const hex = (ts >>> 0).toString(16).padStart(8, "0").split("");
  return [5, 6, 3, 7, 1, 2, 0, 4].map((i) => hex[i]).join("");
}

// ---------------------------------------------------------------------------
// Credenciales derivadas
// ---------------------------------------------------------------------------

export interface Rriot {
  u: string;
  s: string;
  h: string;
  k: string;
  r: { a: string; m: string };
}

/**
 * Deriva usuario y contraseña del broker MQTT a partir de los datos rriot del login.
 */
export function deriveMqttCredentials(rriot: Pick<Rriot, "u" | "s" | "k">): {
  username: string;
  password: string;
} {
  return {
    username: md5hex(rriot.u + ":" + rriot.k).substring(2, 10), // 8 chars
    password: md5hex(rriot.s + ":" + rriot.k).substring(16), // 16 chars
  };
}

/**
 * Cifra la contraseña para el login por password (Login V4).
 */
export function encryptPassword(password: string, k: string): string {
  const derivedKey = k.slice(4) + k.slice(0, 4);
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(derivedKey, "utf-8"), null);
  cipher.setAutoPadding(true);
  let encrypted = cipher.update(password, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

// ---------------------------------------------------------------------------
// V1 — AES-128-ECB  (protocolo del Qrevo S5V)
// ---------------------------------------------------------------------------

export function encryptV1(payload: string | Buffer, localKey: string, ts: number): Buffer {
  const key = md5bin(encodeTimestamp(ts) + localKey + SALT);
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(toBuffer(payload)), cipher.final()]);
}

export function decryptV1(payload: Buffer, localKey: string, ts: number): Buffer {
  const key = md5bin(encodeTimestamp(ts) + localKey + SALT);
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

// ---------------------------------------------------------------------------
// A01 — AES-128-CBC (IV derivado del random del header)
// ---------------------------------------------------------------------------

function a01Iv(random: number): Buffer {
  const randomHex = (random >>> 0).toString(16).padStart(8, "0");
  const ivHex = md5hex(randomHex + A01_IV_SEED).substring(8, 24);
  return Buffer.from(ivHex, "utf-8");
}

export function encryptA01(payload: string | Buffer, localKey: string, random: number): Buffer {
  const key = Buffer.from(localKey, "utf-8");
  const iv = a01Iv(random);
  const buf = toBuffer(payload);
  // Padding PKCS7 manual (como en el original)
  const pad = 16 - (buf.length % 16);
  const padded = Buffer.concat([buf, Buffer.alloc(pad, pad)]);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

export function decryptA01(payload: Buffer, localKey: string, random: number): Buffer {
  const key = Buffer.from(localKey, "utf-8");
  const iv = a01Iv(random);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  const out = Buffer.concat([decipher.update(payload), decipher.final()]);
  // Quitar padding PKCS7
  const pad = out[out.length - 1];
  return pad > 0 && pad <= 16 ? out.subarray(0, out.length - pad) : out;
}

// ---------------------------------------------------------------------------
// B01 — AES-128-CBC con IV derivado (MD5 del random + sal B01)
// ---------------------------------------------------------------------------

export function deriveB01IV(ivInput: number): Buffer {
  const randomBuffer = Buffer.alloc(4);
  randomBuffer.writeUInt32BE(ivInput >>> 0, 0);
  const rStr = randomBuffer.toString("hex").toLowerCase();
  const hash = md5hex(rStr + SALT_B01);
  return Buffer.from(hash.substring(9, 25), "utf8");
}

export function encryptB01(payload: string | Buffer, localKey: string, ivInput: number): Buffer {
  const key = toBuffer(localKey);
  const iv = deriveB01IV(ivInput);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(toBuffer(payload)), cipher.final()]);
}

export function decryptB01(payload: Buffer, localKey: string, ivInput: number): Buffer {
  const key = toBuffer(localKey);
  const iv = deriveB01IV(ivInput);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

// ---------------------------------------------------------------------------
// L01 — AES-256-GCM (clave/IV/AAD derivados de ts, seq, random y nonces)
// ---------------------------------------------------------------------------

function l01Key(localKey: string, ts: number): Buffer {
  return crypto.createHash("sha256").update(encodeTimestamp(ts) + localKey + SALT).digest();
}

function l01Iv(seq: number, random: number, ts: number): Buffer {
  const input = Buffer.alloc(12);
  input.writeUInt32BE(seq >>> 0, 0);
  input.writeUInt32BE(random >>> 0, 4);
  input.writeUInt32BE(ts >>> 0, 8);
  return crypto.createHash("sha256").update(input).digest().subarray(0, 12);
}

function l01Aad(seq: number, connectNonce: number, ackNonce: number, random: number, ts: number): Buffer {
  const aad = Buffer.alloc(20);
  aad.writeUInt32BE(seq >>> 0, 0);
  aad.writeUInt32BE(connectNonce >>> 0, 4);
  aad.writeUInt32BE(ackNonce >>> 0, 8);
  aad.writeUInt32BE(random >>> 0, 12);
  aad.writeUInt32BE(ts >>> 0, 16);
  return aad;
}

export function encryptL01(
  payload: string | Buffer,
  localKey: string,
  ts: number,
  seq: number,
  random: number,
  connectNonce: number,
  ackNonce: number,
): Buffer {
  const cipher = crypto.createCipheriv("aes-256-gcm", l01Key(localKey, ts), l01Iv(seq, random, ts));
  cipher.setAAD(l01Aad(seq, connectNonce, ackNonce, random, ts));
  const ciphertext = Buffer.concat([cipher.update(toBuffer(payload)), cipher.final()]);
  return Buffer.concat([ciphertext, cipher.getAuthTag()]);
}

export function decryptL01(
  payload: Buffer,
  localKey: string,
  ts: number,
  seq: number,
  random: number,
  connectNonce: number,
  ackNonce: number,
): Buffer {
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", l01Key(localKey, ts), l01Iv(seq, random, ts));
  decipher.setAAD(l01Aad(seq, connectNonce, ackNonce, random, ts));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
