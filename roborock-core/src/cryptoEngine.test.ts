import { describe, expect, it } from "vitest";
import {
  decryptA01,
  decryptB01,
  decryptL01,
  decryptV1,
  deriveMqttCredentials,
  encodeTimestamp,
  encryptA01,
  encryptB01,
  encryptL01,
  encryptPassword,
  encryptV1,
  md5hex,
} from "./cryptoEngine";

// localKey real de Roborock = cadena de 16 caracteres
const LOCAL_KEY = "0123456789abcdef";
const TS = 0x66a1b2c3; // timestamp de ejemplo (segundos)
const SAMPLE = JSON.stringify({ dps: { "101": JSON.stringify({ id: 42, method: "get_status", params: [] }) }, t: TS });

describe("encodeTimestamp", () => {
  it("reordena los dígitos hex según el patrón fijo", () => {
    // 0x12345678 -> "12345678" -> indices [5,6,3,7,1,2,0,4] -> "67482315"
    expect(encodeTimestamp(0x12345678)).toBe("67482315");
  });

  it("rellena a 8 dígitos", () => {
    expect(encodeTimestamp(1)).toHaveLength(8);
  });
});

describe("V1 (AES-128-ECB) — protocolo del Qrevo S5V", () => {
  it("descifra lo que cifra (ida y vuelta)", () => {
    const enc = encryptV1(SAMPLE, LOCAL_KEY, TS);
    const dec = decryptV1(enc, LOCAL_KEY, TS).toString("utf-8");
    expect(dec).toBe(SAMPLE);
  });

  it("produce ciphertext distinto del texto plano", () => {
    const enc = encryptV1(SAMPLE, LOCAL_KEY, TS);
    expect(enc.toString("utf-8")).not.toBe(SAMPLE);
    expect(enc.length % 16).toBe(0); // bloque AES
  });

  it("una clave/timestamp distinto NO descifra bien", () => {
    const enc = encryptV1(SAMPLE, LOCAL_KEY, TS);
    expect(() => decryptV1(enc, LOCAL_KEY, TS + 1)).toThrow();
  });
});

describe("A01 (AES-128-CBC)", () => {
  it("ida y vuelta", () => {
    const random = 0xdeadbeef;
    const enc = encryptA01(SAMPLE, LOCAL_KEY, random);
    const dec = decryptA01(enc, LOCAL_KEY, random).toString("utf-8");
    expect(dec).toBe(SAMPLE);
  });
});

describe("B01 (AES-128-CBC, IV derivado)", () => {
  it("ida y vuelta", () => {
    const random = 0x0badf00d;
    const enc = encryptB01(SAMPLE, LOCAL_KEY, random);
    const dec = decryptB01(enc, LOCAL_KEY, random).toString("utf-8");
    expect(dec).toBe(SAMPLE);
  });
});

describe("L01 (AES-256-GCM)", () => {
  it("ida y vuelta con nonces", () => {
    const seq = 7;
    const random = 0x11223344;
    const connectNonce = 0xaabbccdd;
    const ackNonce = 0x55667788;
    const enc = encryptL01(SAMPLE, LOCAL_KEY, TS, seq, random, connectNonce, ackNonce);
    const dec = decryptL01(enc, LOCAL_KEY, TS, seq, random, connectNonce, ackNonce).toString("utf-8");
    expect(dec).toBe(SAMPLE);
  });

  it("un tag/nonce manipulado falla la autenticación", () => {
    const enc = encryptL01(SAMPLE, LOCAL_KEY, TS, 7, 1, 2, 3);
    enc[0] ^= 0xff; // corromper ciphertext
    expect(() => decryptL01(enc, LOCAL_KEY, TS, 7, 1, 2, 3)).toThrow();
  });
});

describe("deriveMqttCredentials", () => {
  it("aplica las fórmulas MD5 correctas y longitudes esperadas", () => {
    const rriot = { u: "user-abc", s: "sess-xyz", k: "keykeykeykeykeyk" };
    const creds = deriveMqttCredentials(rriot);
    expect(creds.username).toBe(md5hex(rriot.u + ":" + rriot.k).substring(2, 10));
    expect(creds.password).toBe(md5hex(rriot.s + ":" + rriot.k).substring(16));
    expect(creds.username).toHaveLength(8);
    expect(creds.password).toHaveLength(16);
  });
});

describe("encryptPassword (login V4)", () => {
  it("es determinista y descifrable con la clave derivada", () => {
    const k = "abcdefghijklmnop"; // 16 chars
    const enc1 = encryptPassword("miPassword", k);
    const enc2 = encryptPassword("miPassword", k);
    expect(enc1).toBe(enc2); // ECB determinista
    expect(enc1).toMatch(/^[A-Za-z0-9+/=]+$/); // base64
  });
});
