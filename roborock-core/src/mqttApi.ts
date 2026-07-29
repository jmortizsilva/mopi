/**
 * mqttApi — conexión al broker MQTT de Roborock y publicación/suscripción de frames.
 *
 * Portado de ioBroker.roborock (`src/lib/mqttApi.ts`). Ver PROTOCOLO_ROBOROCK.md §6.
 *
 * En Node usa `mqtt` (mqtt.js) sobre TCP/TLS. En React Native, `mqtt` funciona sobre
 * `react-native-tcp-socket` (streamBuilder) para conservar payloads BINARIOS (Buffer).
 */
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { deriveMqttCredentials, Rriot } from "./cryptoEngine";
import { decodeFrames, RawFrame } from "./messageParser";

export type FrameHandler = (duid: string, frame: RawFrame) => void;

/** Normaliza el esquema del broker que devuelve Roborock (ssl:// → mqtts://). */
export function normalizeBrokerUrl(url: string): string {
  return url.replace(/^ssl:\/\//i, "mqtts://").replace(/^tcp:\/\//i, "mqtt://");
}

export class RoborockMqtt {
  private client: MqttClient | null = null;
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

  /** Conecta, suscribe al topic de entrada y engancha el listener de mensajes. */
  connect(timeoutMs = 10_000): Promise<void> {
    const brokerUrl = normalizeBrokerUrl(this.rriot.r.m);
    const options: IClientOptions = {
      clientId: this.username,
      username: this.username,
      password: this.password,
      keepalive: 30,
      clean: true,
      reconnectPeriod: 60_000,
      connectTimeout: timeoutMs,
    };

    return new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(brokerUrl, options);
      this.client = client;
      let settled = false;

      client.on("message", (topic: string, message: Buffer) => {
        if (!this.frameHandler) return;
        const duid = topic.split("/").pop() ?? "";
        for (const frame of decodeFrames(message)) {
          this.frameHandler(duid, frame);
        }
      });

      client.on("connect", () => {
        client.subscribe(this.subscribeTopic, { qos: 1 }, (err) => {
          if (settled) return;
          settled = true;
          if (err) reject(err);
          else resolve();
        });
      });

      client.on("error", (err: Error) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          client.end(true);
          reject(new Error(`Timeout de conexión MQTT tras ${timeoutMs}ms`));
        }
      }, timeoutMs).unref?.();
    });
  }

  /** Publica un frame binario ya construido hacia el robot indicado. */
  publish(duid: string, frame: Buffer): void {
    if (!this.client) throw new Error("MQTT no conectado.");
    this.client.publish(this.publishTopic(duid), frame, { qos: 1 });
  }

  get connected(): boolean {
    return !!this.client?.connected;
  }

  async end(): Promise<void> {
    await this.client?.endAsync?.();
    this.client = null;
  }
}
