/**
 * minimalMqtt — cliente MQTT 3.1.1 mínimo, sin dependencias, sobre un socket dado.
 *
 * Motivación: en React Native, mqtt.js necesita muchos polyfills de Node (stream, events,
 * process...) y es frágil. Aquí implementamos solo lo que Roborock necesita —CONNECT,
 * SUBSCRIBE, PUBLISH (qos1), PUBACK, PING— manejando bytes crudos (Buffer) directamente
 * sobre el socket TLS nativo (`react-native-tcp-socket`). En Node funciona igual sobre `tls`.
 *
 * Payloads BINARIOS (los frames Roborock van cifrados): por eso trabajamos con Buffer.
 */

/** Interfaz mínima del socket (la cumplen tls.TLSSocket de Node y react-native-tcp-socket). */
export interface MqttSocket {
  write(data: Buffer): void;
  on(event: "data", cb: (data: Buffer) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: () => void): void;
  destroy(): void;
}

export interface MqttConnectOptions {
  clientId: string;
  username: string;
  password: string;
  keepaliveSec?: number;
}

type MessageHandler = (topic: string, payload: Buffer) => void;

// Tipos de paquete MQTT (nibble alto del primer byte)
const PKT = { CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4, SUBSCRIBE: 8, SUBACK: 9, PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14 } as const;

function encodeRemainingLength(len: number): Buffer {
  const bytes: number[] = [];
  do {
    let b = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) b |= 0x80;
    bytes.push(b);
  } while (len > 0);
  return Buffer.from(bytes);
}

/** Cadena UTF-8 con prefijo de longitud de 2 bytes (formato MQTT). */
function encodeString(str: string): Buffer {
  const s = Buffer.from(str, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(s.length, 0);
  return Buffer.concat([len, s]);
}

export class MinimalMqttClient {
  private readonly socket: MqttSocket;
  private buffer: Buffer = Buffer.alloc(0);
  private packetId = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandler: MessageHandler | null = null;
  private connackResolve: ((ok: boolean) => void) | null = null;
  private closed = false;

  constructor(socket: MqttSocket) {
    this.socket = socket;
    this.socket.on("data", (d) => this.onData(d));
    this.socket.on("close", () => this.onClose());
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private nextPacketId(): number {
    this.packetId = this.packetId >= 0xffff ? 1 : this.packetId + 1;
    return this.packetId;
  }

  /** Envía CONNECT y resuelve cuando llega CONNACK con código 0. */
  connect(opts: MqttConnectOptions, timeoutMs = 10000): Promise<void> {
    const keepalive = opts.keepaliveSec ?? 30;
    const varHeader = Buffer.concat([
      encodeString("MQTT"),
      Buffer.from([0x04]), // nivel de protocolo 3.1.1
      Buffer.from([0xc2]), // flags: username + password + clean session
      (() => {
        const b = Buffer.alloc(2);
        b.writeUInt16BE(keepalive, 0);
        return b;
      })(),
    ]);
    const payload = Buffer.concat([encodeString(opts.clientId), encodeString(opts.username), encodeString(opts.password)]);
    this.sendPacket(PKT.CONNECT, 0, Buffer.concat([varHeader, payload]));

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.connackResolve = null;
        reject(new Error(`Timeout esperando CONNACK tras ${timeoutMs}ms`));
      }, timeoutMs);
      (timer as unknown as { unref?: () => void }).unref?.();

      this.connackResolve = (ok) => {
        clearTimeout(timer);
        if (ok) {
          this.startKeepalive(keepalive);
          resolve();
        } else {
          reject(new Error("El broker rechazó la conexión MQTT (CONNACK != 0)"));
        }
      };
    });
  }

  subscribe(topic: string, qos: 0 | 1 = 1): void {
    const pid = Buffer.alloc(2);
    pid.writeUInt16BE(this.nextPacketId(), 0);
    const body = Buffer.concat([pid, encodeString(topic), Buffer.from([qos])]);
    this.sendPacket(PKT.SUBSCRIBE, 0b0010, body); // flags 0b0010 obligatorio en SUBSCRIBE
  }

  /** Publica un payload BINARIO. qos1 por defecto (como la app oficial). */
  publish(topic: string, payload: Buffer, qos: 0 | 1 = 1): void {
    const parts: Buffer[] = [encodeString(topic)];
    if (qos > 0) {
      const pid = Buffer.alloc(2);
      pid.writeUInt16BE(this.nextPacketId(), 0);
      parts.push(pid);
    }
    parts.push(payload);
    this.sendPacket(PKT.PUBLISH, qos << 1, Buffer.concat(parts));
  }

  private startKeepalive(sec: number): void {
    this.keepaliveTimer = setInterval(() => this.sendPacket(PKT.PINGREQ, 0, Buffer.alloc(0)), sec * 1000);
    (this.keepaliveTimer as unknown as { unref?: () => void }).unref?.();
  }

  private sendPacket(type: number, flags: number, body: Buffer): void {
    if (this.closed) return;
    const fixed = Buffer.from([(type << 4) | (flags & 0x0f)]);
    this.socket.write(Buffer.concat([fixed, encodeRemainingLength(body.length), body]));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parseBuffer();
  }

  private parseBuffer(): void {
    while (this.buffer.length >= 2) {
      // Decodificar "remaining length" (varint de hasta 4 bytes) desde el offset 1
      let multiplier = 1;
      let value = 0;
      let i = 1;
      let byte: number;
      do {
        if (i >= this.buffer.length) return; // paquete incompleto
        byte = this.buffer[i];
        value += (byte & 0x7f) * multiplier;
        multiplier *= 128;
        i++;
      } while ((byte & 0x80) !== 0);

      const total = i + value;
      if (this.buffer.length < total) return; // aún no ha llegado entero

      const type = this.buffer[0] >> 4;
      const flags = this.buffer[0] & 0x0f;
      // OJO: en el polyfill `buffer` de RN, subarray() devuelve un Uint8Array sin los
      // métodos de Buffer (readUInt16BE, etc.). Reenvolvemos con Buffer.from.
      const body = Buffer.from(this.buffer.subarray(i, total));
      this.buffer = Buffer.from(this.buffer.subarray(total));
      this.handlePacket(type, flags, body);
    }
  }

  private handlePacket(type: number, flags: number, body: Buffer): void {
    switch (type) {
      case PKT.CONNACK: {
        const returnCode = body.length >= 2 ? body[1] : 0xff;
        this.connackResolve?.(returnCode === 0);
        this.connackResolve = null;
        break;
      }
      case PKT.PUBLISH: {
        const qos = (flags >> 1) & 0x03;
        const topicLen = body.readUInt16BE(0);
        const topic = body.toString("utf8", 2, 2 + topicLen);
        let offset = 2 + topicLen;
        let pid = 0;
        if (qos > 0) {
          pid = body.readUInt16BE(offset);
          offset += 2;
        }
        const payload = Buffer.from(body.subarray(offset));
        if (qos === 1) {
          const ack = Buffer.alloc(2);
          ack.writeUInt16BE(pid, 0);
          this.sendPacket(PKT.PUBACK, 0, ack);
        }
        this.messageHandler?.(topic, payload);
        break;
      }
      // PUBACK / SUBACK / PINGRESP: no requieren acción por nuestra parte
      default:
        break;
    }
  }

  private onClose(): void {
    this.closed = true;
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }

  disconnect(): void {
    if (this.closed) return;
    try {
      this.sendPacket(PKT.DISCONNECT, 0, Buffer.alloc(0));
    } catch {
      /* ignore */
    }
    this.onClose();
    this.socket.destroy();
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
