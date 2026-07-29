/**
 * mqttApi (React Native) — conexión al broker Roborock sobre TLS nativo.
 *
 * Sustituye a la versión Node (mqtt.js). Usa react-native-tcp-socket para el socket TLS
 * y el MinimalMqttClient para el protocolo MQTT. Interfaz idéntica a la de Node, así que
 * roborockClient.ts no cambia.
 *
 * ⚠️ A verificar en el primer build en dispositivo:
 *   - Que react-native-tcp-socket confía en la CA del broker de Roborock. Si el handshake
 *     TLS falla, habrá que pasar el certificado CA en las opciones de connectTLS.
 */
import TcpSocket from "react-native-tcp-socket";
import { deriveMqttCredentials, Rriot } from "./cryptoEngine";
import { decodeFrames, RawFrame } from "./messageParser";
import { MinimalMqttClient, MqttSocket } from "./mqtt/minimalMqtt";

export type FrameHandler = (duid: string, frame: RawFrame) => void;

function parseBroker(url: string): { host: string; port: number } {
  const m = url.match(/^\w+:\/\/([^:/]+):(\d+)/);
  if (!m) throw new Error(`URL de broker MQTT no válida: ${url}`);
  return { host: m[1], port: parseInt(m[2], 10) };
}

export class RoborockMqtt {
  private client: MinimalMqttClient | null = null;
  private socket: ReturnType<typeof TcpSocket.connectTLS> | null = null;
  private readonly rriot: Rriot;
  readonly username: string;
  private readonly password: string;
  private frameHandler: FrameHandler | null = null;

  constructor(rriot: Rriot) {
    this.rriot = rriot;
    const creds = deriveMqttCredentials(rriot);
    this.username = creds.username;
    this.password = creds.password;
  }

  onFrame(handler: FrameHandler): void {
    this.frameHandler = handler;
  }

  private get subscribeTopic(): string {
    return `rr/m/o/${this.rriot.u}/${this.username}/#`;
  }

  private publishTopic(duid: string): string {
    return `rr/m/i/${this.rriot.u}/${this.username}/${duid}`;
  }

  connect(timeoutMs = 12000): Promise<void> {
    const { host, port } = parseBroker(this.rriot.r.m);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const timer = setTimeout(() => fail(new Error(`Timeout de conexión MQTT tras ${timeoutMs}ms`)), timeoutMs);
      (timer as unknown as { unref?: () => void }).unref?.();

      // Handshake TLS; el callback se dispara cuando la conexión segura está lista.
      const socket = TcpSocket.connectTLS({ host, port }, () => {
        try {
          const mqttSock: MqttSocket = {
            write: (data) => socket.write(data as unknown as Buffer),
            on: (event, cb) => socket.on(event as never, cb as never),
            destroy: () => socket.destroy(),
          };

          const client = new MinimalMqttClient(mqttSock);
          this.client = client;

          client.onMessage((topic, payload) => {
            if (!this.frameHandler) return;
            const duid = topic.split("/").pop() ?? "";
            for (const frame of decodeFrames(payload)) this.frameHandler(duid, frame);
          });

          client
            .connect({ clientId: this.username, username: this.username, password: this.password, keepaliveSec: 30 }, timeoutMs)
            .then(() => {
              client.subscribe(this.subscribeTopic, 1);
              clearTimeout(timer);
              if (!settled) {
                settled = true;
                resolve();
              }
            })
            .catch(fail);
        } catch (e) {
          fail(e as Error);
        }
      });

      this.socket = socket;
      socket.on("error", (e: Error) => fail(e));
    });
  }

  publish(duid: string, frame: Buffer): void {
    if (!this.client || this.client.isClosed) throw new Error("MQTT no conectado.");
    this.client.publish(this.publishTopic(duid), frame, 1);
  }

  get connected(): boolean {
    return !!this.client && !this.client.isClosed;
  }

  async end(): Promise<void> {
    this.client?.disconnect();
    this.client = null;
    this.socket = null;
  }
}
