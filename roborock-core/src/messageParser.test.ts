import { describe, expect, it } from "vitest";
import { encryptV1 } from "./cryptoEngine";
import {
  buildV1PayloadJson,
  buildV1Request,
  decodeFrames,
  decryptV1Frame,
  encodeFrame,
  parseV1Response,
  PROTO_RPC_REQUEST,
  PROTO_RPC_RESPONSE,
  RawFrame,
} from "./messageParser";

const LOCAL_KEY = "0123456789abcdef";

/** Construye un frame de RESPUESTA V1 (protocol 102) tal y como lo enviaría el robot. */
function buildV1ResponseFrame(messageID: number, result: unknown, ts: number): Buffer {
  const outer = JSON.stringify({ dps: { "102": JSON.stringify({ id: messageID, result }) }, t: ts });
  const encrypted = encryptV1(outer, LOCAL_KEY, ts);
  return encodeFrame({
    version: "1.0",
    seq: 1,
    random: 12345,
    timestamp: ts,
    protocol: PROTO_RPC_RESPONSE,
    payload: encrypted,
  });
}

describe("encodeFrame / decodeFrames", () => {
  it("ida y vuelta con CRC válido", () => {
    const payload = Buffer.from("payload-cifrado-simulado");
    const frame = encodeFrame({
      version: "1.0",
      seq: 5,
      random: 999,
      timestamp: 0x66a1b2c3,
      protocol: PROTO_RPC_REQUEST,
      payload,
    });

    const [decoded] = decodeFrames(frame);
    expect(decoded.version).toBe("1.0");
    expect(decoded.seq).toBe(5);
    expect(decoded.random).toBe(999);
    expect(decoded.timestamp).toBe(0x66a1b2c3);
    expect(decoded.protocol).toBe(PROTO_RPC_REQUEST);
    expect(decoded.payload.equals(payload)).toBe(true);
    expect(decoded.crcValid).toBe(true);
  });

  it("decodifica varios frames concatenados", () => {
    const f1 = encodeFrame({ version: "1.0", seq: 1, random: 1, timestamp: 100, protocol: 101, payload: Buffer.from("aaa") });
    const f2 = encodeFrame({ version: "1.0", seq: 2, random: 2, timestamp: 200, protocol: 102, payload: Buffer.from("bbbb") });
    const frames = decodeFrames(Buffer.concat([f1, f2]));
    expect(frames).toHaveLength(2);
    expect(frames[0].seq).toBe(1);
    expect(frames[1].seq).toBe(2);
    expect(frames.every((f) => f.crcValid)).toBe(true);
  });

  it("detecta un CRC corrupto", () => {
    const frame = encodeFrame({ version: "1.0", seq: 1, random: 1, timestamp: 100, protocol: 101, payload: Buffer.from("payload") });
    frame[HEADER_OFFSET_PAYLOAD] ^= 0xff; // corromper un byte del payload
    const [decoded] = decodeFrames(frame);
    expect(decoded.crcValid).toBe(false);
  });
});

// offset del primer byte de payload (tras la cabecera de 19 bytes)
const HEADER_OFFSET_PAYLOAD = 19;

describe("buildV1PayloadJson", () => {
  it("envuelve el RPC en dps.101 con el orden correcto", () => {
    const json = buildV1PayloadJson(42, "app_start", [], 1000);
    const outer = JSON.parse(json);
    expect(outer.t).toBe(1000);
    expect(typeof outer.dps["101"]).toBe("string");
    const inner = JSON.parse(outer.dps["101"]);
    expect(inner).toEqual({ id: 42, method: "app_start", params: [] });
  });
});

describe("buildV1Request (frame completo)", () => {
  it("genera un frame que se puede decodificar y descifrar al JSON original", () => {
    const ts = 0x66a1b2c3;
    const frame = buildV1Request({
      localKey: LOCAL_KEY,
      method: "get_status",
      params: [],
      messageID: 7,
      seq: 3,
      timestamp: ts,
      random: 555,
    });

    const [decoded] = decodeFrames(frame);
    expect(decoded.crcValid).toBe(true);
    expect(decoded.protocol).toBe(PROTO_RPC_REQUEST);

    const outer = decryptV1Frame(decoded, LOCAL_KEY);
    expect(outer.t).toBe(ts);
    const inner = JSON.parse(outer.dps["101"]);
    expect(inner).toEqual({ id: 7, method: "get_status", params: [] });
  });
});

describe("parseV1Response", () => {
  it("extrae id y result de una respuesta protocol 102", () => {
    const ts = 0x66a1b2c3;
    const frame = buildV1ResponseFrame(7, ["ok"], ts);
    const [decoded] = decodeFrames(frame) as RawFrame[];
    const res = parseV1Response(decoded, LOCAL_KEY);
    expect(res.id).toBe(7);
    expect(res.result).toEqual(["ok"]);
    expect(res.dpsKey).toBe("102");
  });

  it("casa la respuesta con la petición por messageID", () => {
    const ts = 0x66a1b2c3;
    const messageID = 12345;
    const responseFrame = buildV1ResponseFrame(messageID, { battery: 87, state: 8 }, ts);
    const [decoded] = decodeFrames(responseFrame);
    const res = parseV1Response(decoded, LOCAL_KEY);
    expect(res.id).toBe(messageID);
    expect(res.result).toEqual({ battery: 87, state: 8 });
  });
});
