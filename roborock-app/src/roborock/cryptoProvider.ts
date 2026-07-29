/**
 * cryptoProvider (React Native).
 *
 * - Hash / HMAC / randomBytes → react-native-quick-crypto (funcionan bien).
 * - Cifrado AES ECB/CBC → aes-js en JS puro (jsAes), porque quick-crypto (Nitro) rechaza
 *   el cifrado AES tal y como lo usa el protocolo V1. Validado byte a byte contra node:crypto.
 * - Otros cifrados (p. ej. GCM del protocolo L01, no usado por el Qrevo S5V) → quick-crypto.
 *
 * Así el resto del núcleo (cryptoEngine) queda idéntico a la versión de Node.
 */
import QuickCrypto from "react-native-quick-crypto";
import type nodeCrypto from "node:crypto";
import { makeJsCipher } from "./jsAes";

const RN = QuickCrypto as any;

/** quick-crypto rechaza `Buffer`; convertimos a Uint8Array plano para hash/hmac. */
function toU8(x: any): any {
  if (x == null || typeof x === "string") return x;
  if (x instanceof Uint8Array) return Uint8Array.from(x);
  return x;
}

function wrapHash(h: any) {
  const api = {
    update(data: any, ...rest: any[]) {
      h.update(typeof data === "string" ? data : toU8(data), ...rest);
      return api;
    },
    digest(...args: any[]) {
      return h.digest(...args);
    },
  };
  return api;
}

// Fallback de cifrado por quick-crypto (para algoritmos no ECB/CBC).
function wrapRnCipher(c: any) {
  return {
    update: (data: any, ...rest: any[]) => c.update(typeof data === "string" ? data : toU8(data), ...rest),
    final: (...args: any[]) => c.final(...args),
    setAutoPadding: (v?: boolean) => c.setAutoPadding(v),
    getAuthTag: () => c.getAuthTag(),
    setAAD: (aad: any) => c.setAAD(toU8(aad)),
    setAuthTag: (tag: any) => c.setAuthTag(toU8(tag)),
  };
}

export const crypto = {
  createHash: (algorithm: string) => wrapHash(RN.createHash(algorithm)),
  createHmac: (algorithm: string, key: any) => wrapHash(RN.createHmac(algorithm, toU8(key))),
  randomBytes: (size: number) => RN.randomBytes(size),
  createCipheriv: (algorithm: string, key: any, iv: any, options?: any) =>
    makeJsCipher("encrypt", algorithm, key, iv) ??
    wrapRnCipher(RN.createCipheriv(algorithm, toU8(key), iv == null ? null : toU8(iv), options)),
  createDecipheriv: (algorithm: string, key: any, iv: any, options?: any) =>
    makeJsCipher("decrypt", algorithm, key, iv) ??
    wrapRnCipher(RN.createDecipheriv(algorithm, toU8(key), iv == null ? null : toU8(iv), options)),
} as unknown as typeof nodeCrypto;
