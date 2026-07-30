/**
 * RoborockClient — orquestador de alto nivel.
 *
 * Une httpApi (login + dispositivos) + mqttApi (transporte) + messageParser (frames)
 * + pendingRequests (correlación). Expone `sendCommand()` que devuelve una promesa
 * resuelta con el resultado del robot.
 *
 * Uso típico:
 *   const http = new HttpApi({ region: "eu", username, clientId });
 *   await http.requestEmailCode();           // llega código al email
 *   await http.loginWithCode(code);
 *   const client = new RoborockClient(http);
 *   await client.start();                     // carga dispositivos + conecta MQTT
 *   const status = await client.sendCommand(duid, "get_status");
 */
import { HomeData, HttpApi, Product, Room } from "./httpApi";
import { RoborockMqtt } from "./mqttApi";
import { buildV1Request, parseV1Response, PROTO_RPC_RESPONSE, RawFrame } from "./messageParser";
import { PendingRequests } from "./pendingRequests";
import { METHOD } from "./commands";
import { DecodedStatus, decodeStatus } from "./statusDecoder";

export interface SendCommandOptions {
  params?: unknown;
  timeoutMs?: number;
}

/** Habitación real del mapa: id de segmento (para limpiar) + nombre. */
export interface MappedRoom {
  segmentId: number;
  roomId: string;
  name: string;
}

/**
 * Cruza el resultado de `get_room_mapping` (segmentos reales del mapa) con los nombres de
 * las habitaciones de la casa. Formato de cada entrada: [segmentId, "roomId", ...extra].
 * Función pura → testable. Las habitaciones "fantasma" de la casa (sin segmento en el mapa)
 * quedan fuera automáticamente.
 */
export function joinRoomMapping(mapping: unknown, rooms: { id: number; name: string }[]): MappedRoom[] {
  if (!Array.isArray(mapping)) return [];
  return mapping.map((entry: unknown) => {
    const segmentId = Array.isArray(entry) ? Number(entry[0]) : Number(entry);
    const roomId = Array.isArray(entry) ? String(entry[1]) : "";
    const room = rooms.find((r) => String(r.id) === roomId);
    return { segmentId, roomId, name: room?.name ?? `Habitación ${segmentId}` };
  });
}

/** Une listas de habitaciones quitando duplicados por id (la primera gana). Pura → testable. */
export function dedupeRoomsById(rooms: Room[]): Room[] {
  const seen = new Set<string>();
  const out: Room[] = [];
  for (const r of rooms) {
    const key = String(r.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Actividad de un comando (para el registro de pruebas). `dir`: out = enviado, in = respuesta. */
export interface ActividadComando {
  dir: "out" | "in";
  method: string;
  messageID: number;
  params?: unknown;
  result?: unknown;
  error?: string;
}

export class RoborockClient {
  readonly http: HttpApi;
  private mqtt: RoborockMqtt | null = null;
  private home: HomeData | null = null;
  private localKeys = new Map<string, string>();
  private readonly pending = new PendingRequests();
  /** Hook opcional para observar comandos y respuestas (lo usa el registro de pruebas). */
  onActivity?: (a: ActividadComando) => void;

  constructor(http: HttpApi) {
    this.http = http;
  }

  /** Carga la lista de dispositivos y conecta el MQTT. */
  async start(): Promise<HomeData> {
    if (!this.http.userData) throw new Error("HttpApi sin sesión: haz login antes de start().");

    this.home = await this.http.getHomeData();
    this.localKeys = HttpApi.localKeyMap(this.home);

    this.mqtt = new RoborockMqtt(this.http.userData.rriot);
    this.mqtt.onFrame((duid, frame) => this.handleFrame(duid, frame));
    await this.mqtt.connect();

    return this.home;
  }

  get devices() {
    return this.home?.devices ?? [];
  }

  get rooms() {
    return this.home?.rooms ?? [];
  }

  get products(): Product[] {
    return this.home?.products ?? [];
  }

  /** Cadena de modelo del dispositivo (p. ej. "roborock.vacuum.a170"), o null si se desconoce. */
  modelFor(duid: string): string | null {
    const device = this.devices.find((d) => d.duid === duid);
    if (!device) return null;
    return this.products.find((p) => p.id === device.productId)?.model ?? null;
  }

  /** Garantiza que el MQTT está conectado, reconectando bajo demanda (deduplicando). */
  private connecting: Promise<void> | null = null;
  private async ensureConnected(): Promise<void> {
    if (!this.mqtt) throw new Error("Cliente no iniciado. Llama a start() primero.");
    if (this.mqtt.connected) return;
    if (!this.connecting) {
      this.connecting = this.mqtt.connect().finally(() => {
        this.connecting = null;
      });
    }
    await this.connecting;
  }

  private handleFrame(duid: string, frame: RawFrame): void {
    if (!frame.crcValid) return;
    const localKey = this.localKeys.get(duid);
    if (!localKey) return;

    // Respuesta RPC estándar (V1)
    if (frame.protocol === PROTO_RPC_RESPONSE && frame.version === "1.0") {
      try {
        const res = parseV1Response(frame, localKey);
        if (typeof res.id === "number") {
          this.pending.resolve(res.id, res.error ? { error: res.error } : res.result);
        }
      } catch {
        // frame no parseable; se ignora
      }
    }
  }

  /**
   * Envía un comando RPC V1 (p. ej. "get_status", "app_start", "app_charge") y espera
   * la respuesta correlada por messageID.
   */
  async sendCommand(duid: string, method: string, opts: SendCommandOptions = {}): Promise<unknown> {
    await this.ensureConnected();
    const localKey = this.localKeys.get(duid);
    if (!localKey) throw new Error(`No hay localKey para el dispositivo ${duid}.`);

    const messageID = this.pending.nextId();
    const frame = buildV1Request({
      localKey,
      method,
      params: opts.params ?? [],
      messageID,
    });

    if (!this.mqtt) throw new Error("MQTT no disponible tras conectar.");
    const promise = this.pending.add(messageID, method, { timeoutMs: opts.timeoutMs });
    this.onActivity?.({ dir: "out", method, messageID, params: opts.params ?? [] });
    this.mqtt.publish(duid, frame);
    return promise.then(
      (result) => {
        this.onActivity?.({ dir: "in", method, messageID, result });
        return result;
      },
      (error) => {
        this.onActivity?.({ dir: "in", method, messageID, error: (error as Error)?.message ?? String(error) });
        throw error;
      },
    );
  }

  async stop(): Promise<void> {
    this.pending.rejectAll(new Error("Cliente detenido."));
    await this.mqtt?.end();
    this.mqtt = null;
  }

  // -------------------------------------------------------------------------
  // Comandos de alto nivel
  // -------------------------------------------------------------------------

  /** Estado crudo (array tal cual lo devuelve el robot). */
  getStatusRaw(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_STATUS, { timeoutMs: 15000 });
  }

  /** Estado ya decodificado a texto accesible. */
  async getStatus(duid: string): Promise<DecodedStatus> {
    return decodeStatus(await this.getStatusRaw(duid));
  }

  startCleaning(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.START);
  }
  stopCleaning(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.STOP);
  }
  pause(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.PAUSE);
  }
  dock(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.DOCK);
  }
  findMe(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.FIND_ME);
  }

  /** Limpia habitaciones concretas por su ID de segmento (los de getHomeData().rooms). */
  cleanSegments(duid: string, segments: number[], repeat = 1): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SEGMENT_CLEAN, { params: [{ segments, repeat }] });
  }

  setFanPower(duid: string, code: number): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_FAN, { params: [code] });
  }
  setWaterBox(duid: string, code: number): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_WATER, { params: [code] });
  }
  setMopMode(duid: string, code: number): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_MOP, { params: [code] });
  }

  getRoomMapping(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.ROOM_MAPPING);
  }

  // Nombres de habitaciones compartidas por duid, cacheados (evita repetir la llamada de red).
  private sharedRoomsCache = new Map<string, Room[]>();

  /**
   * Habitaciones REALES del mapa (nombre + id de segmento correcto para limpiar).
   * Cruza el mapa con los nombres de la casa Y con los del dispositivo compartido, para que una
   * cuenta invitada vea los nombres que puso el dueño. Filtra las fantasma no mapeadas.
   */
  async getMappedRooms(duid: string): Promise<MappedRoom[]> {
    const [mapping, shared] = await Promise.all([this.getRoomMapping(duid), this.getSharedRooms(duid)]);
    const rooms = dedupeRoomsById([...(this.home?.rooms ?? []), ...shared]);
    return joinRoomMapping(mapping, rooms);
  }

  /** Habitaciones de un dispositivo compartido (cacheadas). Vacío para dispositivos propios. */
  private async getSharedRooms(duid: string): Promise<Room[]> {
    const cached = this.sharedRoomsCache.get(duid);
    if (cached) return cached;
    const rooms = await this.http.getSharedDeviceRooms(duid);
    this.sharedRoomsCache.set(duid, rooms);
    return rooms;
  }
  getConsumables(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.CONSUMABLE);
  }

  /** Reinicia un consumible (p. ej. "main_brush_work_time") al cambiarlo por uno nuevo. */
  resetConsumable(duid: string, key: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.RESET_CONSUMABLE, { params: [key] });
  }

  // -------------------------------------------------------------------------
  // Ajustes / configuración (lectura). Seguros: no mueven el robot.
  // -------------------------------------------------------------------------

  getVolume(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_SOUND_VOLUME);
  }
  getDnd(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_DND);
  }
  getChildLock(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_CHILD_LOCK);
  }
  getLed(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_LED);
  }
  getCarpetMode(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_CARPET_MODE);
  }
  getCollisionAvoid(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_COLLISION);
  }
  getDryerSetting(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_DRYER_SETTING);
  }
  getDustMode(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_DUST_MODE);
  }
  getDustSwitch(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_DUST_SWITCH);
  }
  getSmartWash(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_SMART_WASH);
  }
  getWashTowelMode(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.GET_WASH_TOWEL);
  }

  /** Lee TODOS los ajustes de golpe (para inspeccionar formatos). Tolera fallos por comando. */
  async dumpSettings(duid: string): Promise<Record<string, unknown>> {
    const reads: [string, () => Promise<unknown>][] = [
      ["sound_volume", () => this.getVolume(duid)],
      ["dnd_timer", () => this.getDnd(duid)],
      ["child_lock", () => this.getChildLock(duid)],
      ["led_status", () => this.getLed(duid)],
      ["carpet_mode", () => this.getCarpetMode(duid)],
      ["collision_avoid", () => this.getCollisionAvoid(duid)],
      ["dryer_setting", () => this.getDryerSetting(duid)],
      ["dust_collection_mode", () => this.getDustMode(duid)],
      ["dust_collection_switch", () => this.getDustSwitch(duid)],
      ["smart_wash_params", () => this.getSmartWash(duid)],
      ["wash_towel_mode", () => this.getWashTowelMode(duid)],
      ["consumables", () => this.getConsumables(duid)],
    ];
    const out: Record<string, unknown> = {};
    for (const [name, fn] of reads) {
      try {
        out[name] = await fn();
      } catch (e) {
        out[name] = { error: (e as Error).message };
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Ajustes (escritura). Formatos a confirmar con dumpSettings antes de usar en producción.
  // -------------------------------------------------------------------------

  setVolume(duid: string, volume: number): Promise<unknown> {
    return this.sendCommand(duid, METHOD.CHANGE_SOUND_VOLUME, { params: [volume] });
  }
  setChildLock(duid: string, on: boolean): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_CHILD_LOCK, { params: { lock_status: on ? 1 : 0 } });
  }
  setLed(duid: string, on: boolean): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_LED, { params: [on ? 1 : 0] });
  }
  setDnd(duid: string, startHour: number, startMin: number, endHour: number, endMin: number): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_DND, { params: [startHour, startMin, endHour, endMin] });
  }
  closeDnd(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.CLOSE_DND);
  }
  /**
   * Secado automático de mopa on/off (lee-modifica-escribe para no perder los demás
   * campos: dry_time, cron, off, etc.).
   */
  async setMopAutoDry(duid: string, on: boolean): Promise<unknown> {
    const cur = await this.getDryerSetting(duid);
    const obj = cur && typeof cur === "object" && !Array.isArray(cur) ? { ...(cur as Record<string, unknown>) } : {};
    obj.status = on ? 1 : 0;
    // El GET devuelve un objeto → el SET envía el objeto directo (no envuelto en array).
    return this.sendCommand(duid, METHOD.SET_DRYER_SETTING, { params: obj });
  }
  /**
   * Arrancar (1) o parar (0) el secado de mopa ahora mismo. Objeto SIN envolver en array: con
   * `[{status}]` el robot responde -10007 invalid params (como el resto de sets de objeto).
   */
  setDryerStatus(duid: string, on: boolean): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_DRYER_STATUS, { params: { status: on ? 1 : 0 } });
  }
  /** Arrancar el lavado de la mopa ahora mismo (requiere estación de lavado). */
  startWash(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.START_WASH);
  }
  /** Parar el lavado de la mopa. */
  stopWash(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.STOP_WASH);
  }
  /** Enviar el robot a la base a lavar la mopa y cargar. */
  washThenCharge(duid: string): Promise<unknown> {
    return this.sendCommand(duid, METHOD.WASH_THEN_CHARGE);
  }
  /** Auto-vaciado del depósito de polvo (encender/apagar). */
  setDustSwitch(duid: string, on: boolean): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_DUST_SWITCH, { params: { status: on ? 1 : 0 } });
  }
  /** Frecuencia de auto-vaciado (0 = inteligente, 1..n = cada N limpiezas). */
  setDustMode(duid: string, mode: number): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_DUST_MODE, { params: { mode } });
  }
  setCollisionAvoid(duid: string, on: boolean): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_COLLISION, { params: { status: on ? 1 : 0 } });
  }
  /** Intensidad de lavado de mopa (0 ligero, 1 normal, 2 profundo). */
  setWashTowelMode(duid: string, washMode: number): Promise<unknown> {
    return this.sendCommand(duid, METHOD.SET_WASH_TOWEL, { params: { wash_mode: washMode } });
  }
  /** Modo alfombra on/off (lee-modifica-escribe para conservar los umbrales). */
  async setCarpetMode(duid: string, on: boolean): Promise<unknown> {
    const cur = await this.getCarpetMode(duid);
    const first = Array.isArray(cur) ? cur[0] : cur;
    const obj = first && typeof first === "object" ? { ...(first as Record<string, unknown>) } : {};
    obj.enable = on ? 1 : 0;
    return this.sendCommand(duid, METHOD.SET_CARPET_MODE, { params: [obj] });
  }
}
