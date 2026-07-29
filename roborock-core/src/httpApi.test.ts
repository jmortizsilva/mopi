import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Rriot, md5hex } from "./cryptoEngine";
import { buildHawkHeader, computeHawkMac, randomToken, REGION_CONFIG } from "./httpApi";

const RRIOT: Rriot = {
  u: "user-123",
  s: "sess-456",
  h: "hmac-secret-789",
  k: "keykeykeykeykeyk",
  r: { a: "https://api-eu.roborock.com", m: "ssl://mqtt-eu.roborock.com:8883" },
};

describe("REGION_CONFIG", () => {
  it("tiene las 4 regiones con su base URL", () => {
    expect(REGION_CONFIG.eu.apiBaseUrl).toBe("https://euiot.roborock.com");
    expect(REGION_CONFIG.us.apiBaseUrl).toBe("https://usiot.roborock.com");
    expect(REGION_CONFIG.cn.apiBaseUrl).toContain("cniot");
    expect(REGION_CONFIG.asia.apiBaseUrl).toContain("roborock.com");
  });
});

describe("randomToken", () => {
  it("genera la longitud pedida y evita + y /", () => {
    for (const len of [6, 16]) {
      const t = randomToken(len);
      expect(t).toHaveLength(len);
      expect(t).not.toMatch(/[+/]/);
    }
  });
});

describe("computeHawkMac", () => {
  it("coincide con el cálculo HMAC-SHA256 de referencia", () => {
    const nonce = "abc123";
    const ts = 1722170000;
    const urlPath = "/v3/user/homes/42";

    const prestr = [RRIOT.u, RRIOT.s, nonce, ts, md5hex(urlPath), "", ""].join(":");
    const expected = createHmac("sha256", RRIOT.h).update(prestr).digest("base64");

    expect(computeHawkMac(RRIOT, urlPath, nonce, ts)).toBe(expected);
  });

  it("es determinista para las mismas entradas", () => {
    expect(computeHawkMac(RRIOT, "/x", "n", 1)).toBe(computeHawkMac(RRIOT, "/x", "n", 1));
  });

  it("cambia si cambia el path", () => {
    expect(computeHawkMac(RRIOT, "/a", "n", 1)).not.toBe(computeHawkMac(RRIOT, "/b", "n", 1));
  });
});

describe("buildHawkHeader", () => {
  it("produce la cabecera con el formato Hawk esperado", () => {
    const header = buildHawkHeader(RRIOT, "/v3/user/homes/42", "nonce1", 1722170000);
    expect(header).toMatch(/^Hawk id="user-123", s="sess-456", ts="1722170000", nonce="nonce1", mac="[^"]+"$/);
  });
});
