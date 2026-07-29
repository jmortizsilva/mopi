/**
 * messageParser — frame binario del protocolo Roborock (encode/decode) + helpers V1.
 *
 * Portado y simplificado de ioBroker.roborock (`src/lib/messageParser.ts`).
 * Ver PROTOCOLO_ROBOROCK.md §5 y §7.
 *
 * Frame (big-endian):
 *   version(3) seq(4) random(4) timestamp(4) protocol(2) payloadLen(2) payload(N) crc32(4)
 */
import CRC32 from "crc-32";
import { decryptV1, encryptV1 } from "./cryptoEngine";

export const HEADER_LEN = 19; // 3 + 4 + 4 + 4 + 2 + 2
export const CRC32_LEN = 4;

export type ProtocolVersion = "1.0" | "A01" | "L01" | "B01";

// Números de protocolo (campo `protocol` del frame)
export const PROTO_RPC_REQUEST = 101; // app -> robot (petición RPC por MQTT)
export const PROTO_RPC_RESPONSE = 102; // robot -> app (respuesta RPC)

export interface RawFrame {
  version: string;
  seq: number;
  random: number;
  timestamp: number;
  protocol: number;
  payload: Buffer; // sigue CIFRADO
  crcValid: boolean;
}

export interface EncodeFrameInput {
  version: string; // "1.0", "A01", ...
  seq: number;
  random: number;
  timestamp: number;
  protocol: number;
  payload: Buffer; // ya cifrado
}

function crc32u(buf: Buffer): number {
  return CRC32.buf(buf) >>> 0;
}

/**
 * Ensambla un frame completo (cabecera + payload cifrado + CRC32).
 */
export function encodeFrame(f: EncodeFrameInput): Buffer {
  const buf = Buffer.alloc(HEADER_LEN + f.payload.length + CRC32_LEN);
  buf.write(f.version, 0, 3, "latin1");
  buf.writeUInt32BE(f.seq >>> 0, 3);
  buf.writeUInt32BE(f.random >>> 0, 7);
  buf.writeUInt32BE(f.timestamp >>> 0, 11);
  buf.writeUInt16BE(f.protocol & 0xffff, 15);
  buf.writeUInt16BE(f.payload.length & 0xffff, 17);
  f.payload.copy(buf, HEADER_LEN);
  buf.writeUInt32BE(crc32u(buf.subarray(0, buf.length - CRC32_LEN)), buf.length - CRC32_LEN);
  return buf;
}

/**
 * Decodifica uno o varios frames concatenados. NO descifra el payload.
 * Marca cada frame con `crcValid`.
 */
export function decodeFrames(message: Buffer): RawFrame[] {
  const frames: RawFrame[] = [];
  let offset = 0;

  while (offset + HEADER_LEN + CRC32_LEN <= message.length) {
    const version = message.toString("latin1", offset, offset + 3);
    const seq = message.readUInt32BE(offset + 3);
    const random = message.readUInt32BE(offset + 7);
    const timestamp = message.readUInt32BE(offset + 11);
    const protocol = message.readUInt16BE(offset + 15);
    const payloadLen = message.readUInt16BE(offset + 17);

    const msgLen = HEADER_LEN + payloadLen + CRC32_LEN;
    if (offset + msgLen > message.length) break; // frame incompleto

    const payload = message.subarray(offset + HEADER_LEN, offset + HEADER_LEN + payloadLen);
    const expectedCrc = message.readUInt32BE(offset + msgLen - CRC32_LEN);
    const actualCrc = crc32u(message.subarray(offset, offset + msgLen - CRC32_LEN));

    frames.push({
      version,
      seq,
      random,
      timestamp,
      protocol,
      payload: Buffer.from(payload),
      crcValid: actualCrc === expectedCrc,
    });

    offset += msgLen;
  }

  return frames;
}

// ---------------------------------------------------------------------------
// Helpers V1 (Qrevo S5V): construir petición y parsear respuesta
// ---------------------------------------------------------------------------

let socketSeq = 0;
const MAX_SEQ = 0xffff;

/** Contador de transporte incremental (campo `seq`), 1..0xFFFF. */
export function nextSeq(): number {
  socketSeq = socketSeq >= MAX_SEQ ? 1 : socketSeq + 1;
  return socketSeq;
}

function nextRandom(): number {
  return Math.floor(Math.random() * 1_000_000 + 1_000) >>> 0;
}

export interface V1Inner {
  id: number;
  method: string;
  params: unknown;
}

/** Payload JSON de una petición V1: `{ dps: { "101": "<json inner>" }, t }`. */
export function buildV1PayloadJson(messageID: number, method: string, params: unknown, timestamp: number): string {
  const inner: V1Inner = { id: messageID, method, params };
  return JSON.stringify({ dps: { "101": JSON.stringify(inner) }, t: timestamp });
}

export interface BuildV1RequestOptions {
  localKey: string;
  method: string;
  params?: unknown;
  messageID: number;
  seq?: number;
  timestamp?: number;
  random?: number;
  protocol?: number; // por defecto 101
}

/** Construye el frame binario listo para publicar por MQTT. */
export function buildV1Request(opts: BuildV1RequestOptions): Buffer {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const seq = opts.seq ?? nextSeq();
  const random = opts.random ?? nextRandom();
  const protocol = opts.protocol ?? PROTO_RPC_REQUEST;
  const payloadJson = buildV1PayloadJson(opts.messageID, opts.method, opts.params ?? [], timestamp);
  const encrypted = encryptV1(payloadJson, opts.localKey, timestamp);
  return encodeFrame({ version: "1.0", seq, random, timestamp, protocol, payload: encrypted });
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Descifra el payload de un frame V1 y devuelve el objeto externo `{ dps, t }`. */
export function decryptV1Frame(frame: RawFrame, localKey: string): any {
  const decrypted = decryptV1(frame.payload, localKey, frame.timestamp);
  return safeJson(decrypted.toString("utf-8"));
}

export interface V1Response {
  id?: number;
  result?: unknown;
  error?: unknown;
  dpsKey?: string;
  raw: unknown;
}

/**
 * Parsea una respuesta V1 (protocol 102). Extrae `{ dps: { "<key>": "<json>" } }`
 * y devuelve el `id` (para casar con la petición) y el `result`.
 */
export function parseV1Response(frame: RawFrame, localKey: string): V1Response {
  const outer = decryptV1Frame(frame, localKey);
  let inner: any;
  let dpsKey: string | undefined;

  if (outer && typeof outer === "object" && outer.dps) {
    dpsKey = Object.keys(outer.dps)[0];
    const val = outer.dps[dpsKey as string];
    inner = typeof val === "string" ? safeJson(val) : val;
  }

  return {
    id: inner?.id,
    result: inner?.result,
    error: inner?.error,
    dpsKey,
    raw: outer,
  };
}
