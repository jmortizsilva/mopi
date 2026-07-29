/**
 * jsAes — cifrado AES-ECB/CBC en JavaScript puro (aes-js), con la misma interfaz que los
 * objetos Cipher/Decipher de node:crypto (update/final/setAutoPadding).
 *
 * Motivo: react-native-quick-crypto (Nitro) rechaza el cifrado AES tal y como lo usa el
 * protocolo V1 (clave binaria, IV null). aes-js sí funciona y se ha validado byte a byte
 * contra node:crypto para ECB (V1) y CBC (A01). El hashing/HMAC siguen yendo por quick-crypto.
 */
import * as aesjs from "aes-js";

type Mode = "encrypt" | "decrypt";

function toBytes(data: unknown, inputEnc?: string): Uint8Array {
  if (typeof data === "string") return Uint8Array.from(Buffer.from(data, (inputEnc as BufferEncoding) || "utf8"));
  return Uint8Array.from(data as Uint8Array);
}

function pkcs7pad(b: Uint8Array): Uint8Array {
  const pad = 16 - (b.length % 16);
  const out = new Uint8Array(b.length + pad);
  out.set(b);
  out.fill(pad, b.length);
  return out;
}

function pkcs7unpad(b: Uint8Array): Uint8Array {
  const pad = b[b.length - 1];
  return pad > 0 && pad <= 16 ? b.subarray(0, b.length - pad) : b;
}

export interface JsCipher {
  update(data: unknown, inputEnc?: string, outputEnc?: string): Buffer | string;
  final(outputEnc?: string): Buffer | string;
  setAutoPadding(v?: boolean): void;
}

/**
 * Devuelve un Cipher/Decipher JS para aes-*-ecb / aes-*-cbc, o null si el algoritmo no es
 * ECB/CBC (para que el llamante use otro backend, p. ej. quick-crypto para GCM).
 */
export function makeJsCipher(mode: Mode, algorithm: string, key: unknown, iv: unknown): JsCipher | null {
  const isEcb = algorithm.includes("ecb");
  const isCbc = algorithm.includes("cbc");
  if (!isEcb && !isCbc) return null;

  let autoPad = true;
  const chunks: Uint8Array[] = [];

  function concat(): Uint8Array {
    let len = 0;
    for (const c of chunks) len += c.length;
    const out = new Uint8Array(len);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  return {
    setAutoPadding(v = true) {
      autoPad = v;
    },
    // Acumulamos y hacemos todo el trabajo en final(); update() devuelve vacío.
    update(data: unknown, inputEnc?: string, outputEnc?: string): Buffer | string {
      chunks.push(toBytes(data, inputEnc));
      return outputEnc ? "" : Buffer.alloc(0);
    },
    final(outputEnc?: string): Buffer | string {
      let input = concat();
      if (mode === "encrypt" && autoPad) input = pkcs7pad(input);

      const keyBytes = toBytes(key);
      const cipher = isEcb
        ? new aesjs.ModeOfOperation.ecb(keyBytes)
        : new aesjs.ModeOfOperation.cbc(keyBytes, toBytes(iv));

      const raw = mode === "encrypt" ? cipher.encrypt(input) : cipher.decrypt(input);
      let buf = Buffer.from(raw);
      if (mode === "decrypt" && autoPad) buf = Buffer.from(pkcs7unpad(buf));

      return outputEnc ? buf.toString(outputEnc as BufferEncoding) : buf;
    },
  };
}
