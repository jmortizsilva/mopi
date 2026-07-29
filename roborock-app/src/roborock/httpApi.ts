/**
 * httpApi — login REST de Roborock + firma Hawk + descubrimiento de dispositivos.
 *
 * Portado de ioBroker.roborock (`src/lib/httpApi.ts`). Ver PROTOCOLO_ROBOROCK.md §2 y §3.
 *
 * Usa `fetch` (global en Node 18+ y en React Native) para no depender de axios.
 * A diferencia del original (que bloquea esperando el código 2FA), aquí el login por
 * código se expone en DOS pasos para que la UI de la app pida el código:
 *    1) requestEmailCode(email)
 *    2) loginWithCode(email, code)
 */
import { crypto } from "./cryptoProvider";
import { encryptPassword, md5hex, Rriot } from "./cryptoEngine";

export type Region = "eu" | "us" | "cn" | "asia";

interface RegionConfig {
  apiBaseUrl: string;
  loginCountry: string;
  loginCountryCode: string;
}

export const REGION_CONFIG: Record<Region, RegionConfig> = {
  eu: { apiBaseUrl: "https://euiot.roborock.com", loginCountry: "DE", loginCountryCode: "49" },
  us: { apiBaseUrl: "https://usiot.roborock.com", loginCountry: "US", loginCountryCode: "1" },
  cn: { apiBaseUrl: "https://cniot.roborock.com", loginCountry: "CN", loginCountryCode: "86" },
  asia: { apiBaseUrl: "https://api.roborock.com", loginCountry: "SG", loginCountryCode: "65" },
};

export interface UserData {
  token: string;
  rriot: Rriot;
}

export interface Device {
  duid: string;
  localKey: string;
  productId: string;
  name?: string;
  online: boolean;
  pv: string; // versión de protocolo: "1.0", "A01", "B01", ...
  sn?: string;
}

export interface Product {
  id: string;
  model: string;
  category: string;
  name?: string;
}

export interface Room {
  id: number;
  name: string;
}

export interface HomeData {
  homeId: number;
  devices: Device[];
  products: Product[];
  rooms: Room[];
}

// ---------------------------------------------------------------------------
// Helpers puros (testables sin red)
// ---------------------------------------------------------------------------

/** Genera una cadena base64 "segura" (+/ → X/Y) de longitud `len`. */
export function randomToken(len: number): string {
  const bytes = Math.ceil((len * 3) / 4);
  return crypto
    .randomBytes(bytes)
    .toString("base64")
    .substring(0, len)
    .replace(/\+/g, "X")
    .replace(/\//g, "Y");
}

/** MAC de la firma Hawk (función pura → testable de forma determinista). */
export function computeHawkMac(rriot: Rriot, urlPath: string, nonce: string, timestamp: number): string {
  const prestr = [rriot.u, rriot.s, nonce, timestamp, md5hex(urlPath), "", ""].join(":");
  return crypto.createHmac("sha256", rriot.h).update(prestr).digest("base64");
}

/** Cabecera Authorization completa para la "Real API". */
export function buildHawkHeader(rriot: Rriot, urlPath: string, nonce = randomToken(6), timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = computeHawkMac(rriot, urlPath, nonce, timestamp);
  return `Hawk id="${rriot.u}", s="${rriot.s}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
}

// ---------------------------------------------------------------------------
// Cliente HTTP
// ---------------------------------------------------------------------------

export interface HttpApiOptions {
  region: Region;
  username: string;
  /** Identificador de dispositivo estable (persístelo, p. ej. un UUID en AsyncStorage). */
  clientId: string;
}

export class HttpApi {
  readonly region: Region;
  readonly username: string;
  readonly clientId: string;
  private readonly base: string;
  userData: UserData | null = null;

  constructor(opts: HttpApiOptions) {
    this.region = opts.region;
    this.username = opts.username;
    this.clientId = opts.clientId;
    this.base = REGION_CONFIG[opts.region].apiBaseUrl;
  }

  /** Restaura una sesión previamente persistida (evita repetir el login). */
  setUserData(userData: UserData): void {
    this.userData = userData;
  }

  private loginHeaders(): Record<string, string> {
    const clientid = crypto.createHash("md5").update(this.username).update(this.clientId).digest().toString("base64");
    return {
      header_clientid: clientid,
      header_appversion: "4.57.02",
      header_clientlang: "es",
      header_phonemodel: "Pixel 9 Pro XL",
      header_phonesystem: "Android",
    };
  }

  private async postForm(path: string, body: Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<any> {
    const res = await fetch(`${this.base}/${path}`, {
      method: "POST",
      headers: {
        ...this.loginHeaders(),
        // Imprescindible: si el cuerpo va como string, fetch pondría text/plain y
        // Roborock respondería "missing parameters" (code 1001).
        "Content-Type": "application/x-www-form-urlencoded",
        ...extraHeaders,
      },
      body: new URLSearchParams(body).toString(),
    });
    return res.json();
  }

  /** Paso A: obtiene la clave de firma `k`. */
  async signRequest(s: string): Promise<string> {
    const res = await fetch(`${this.base}/api/v3/key/sign?s=${encodeURIComponent(s)}`, {
      method: "POST",
      headers: this.loginHeaders(),
    });
    const body: any = await res.json();
    const k = body?.data?.k;
    if (!k) throw new Error(`signRequest sin 'k': ${JSON.stringify(body)}`);
    return k;
  }

  /** Solicita el envío del código de 6 dígitos por email. */
  async requestEmailCode(): Promise<void> {
    const body = await this.postForm("api/v4/email/code/send", {
      type: "login",
      email: this.username,
      platform: "",
    });
    if (body && body.code !== 200) {
      throw new Error(`requestEmailCode falló: ${body.msg} (code ${body.code})`);
    }
  }

  /** Login con el código de 6 dígitos recibido por email. */
  async loginWithCode(code: string): Promise<UserData> {
    const s = randomToken(16);
    const k = await this.signRequest(s);
    const cfg = REGION_CONFIG[this.region];

    const body = await this.postForm(
      "api/v4/auth/email/login/code",
      {
        country: cfg.loginCountry,
        countryCode: cfg.loginCountryCode,
        email: this.username,
        code,
        majorVersion: "14",
        minorVersion: "0",
      },
      { "x-mercy-k": k, "x-mercy-ks": s },
    );

    if (body.code !== 200 || !body.data) {
      throw new Error(`loginWithCode falló: ${body.msg} (code ${body.code})`);
    }
    this.userData = body.data as UserData;
    return this.userData;
  }

  /** Login por contraseña. Puede requerir 2FA (devuelve code 2031). */
  async loginByPassword(password: string): Promise<UserData> {
    const s = randomToken(16);
    const k = await this.signRequest(s);
    const body = await this.postForm(
      "api/v4/auth/email/login/pwd",
      {
        email: this.username,
        password: encryptPassword(password, k),
        majorVersion: "14",
        minorVersion: "0",
      },
      { "x-mercy-k": k, "x-mercy-ks": s },
    );

    if (body.code === 2031) {
      throw new Error("La cuenta exige 2FA. Usa requestEmailCode() + loginWithCode().");
    }
    if (body.code !== 200 || !body.data) {
      throw new Error(`loginByPassword falló: ${body.msg} (code ${body.code})`);
    }
    this.userData = body.data as UserData;
    return this.userData;
  }

  private requireUserData(): UserData {
    if (!this.userData) throw new Error("No hay sesión. Haz login primero.");
    return this.userData;
  }

  /** Obtiene el ID de la casa (rrHomeId). */
  async getHomeId(): Promise<number> {
    const ud = this.requireUserData();
    const res = await fetch(`${this.base}/api/v1/getHomeDetail`, {
      headers: { ...this.loginHeaders(), Authorization: ud.token },
    });
    const body: any = await res.json();
    if (!body?.data?.rrHomeId) {
      throw new Error(`getHomeDetail falló: ${JSON.stringify(body)}`);
    }
    return body.data.rrHomeId as number;
  }

  /** Petición GET firmada con Hawk a la Real API (rriot.r.a). */
  private async realApiGet(path: string): Promise<any> {
    const ud = this.requireUserData();
    const url = new URL(path.replace(/^\//, ""), ud.rriot.r.a.replace(/\/?$/, "/"));
    const urlPath = url.pathname + url.search;
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: buildHawkHeader(ud.rriot, urlPath),
        "x-iotsdk-version": "1.0.1",
        "x-app-name": "com.roborock.smart",
        "x-app-version-code": "100834",
        "x-app-version-name": "4.57.02",
        "x-uid": ud.rriot.u,
        "User-Agent": "UA=RRSDKAndroid/1.0.1",
      },
    });
    return res.json();
  }

  /** Descarga la lista de dispositivos, productos y habitaciones. */
  async getHomeData(homeId?: number): Promise<HomeData> {
    const id = homeId ?? (await this.getHomeId());
    const body = await this.realApiGet(`v3/user/homes/${id}`);
    if (!body?.success || !body?.result) {
      throw new Error(`getHomeData falló: ${JSON.stringify(body)}`);
    }
    const r = body.result;
    return {
      homeId: id,
      devices: [...(r.devices ?? []), ...(r.receivedDevices ?? [])],
      products: r.products ?? [],
      rooms: r.rooms ?? [],
    };
  }

  /**
   * Nombres de habitación de un dispositivo COMPARTIDO ("recibido").
   *
   * Las habitaciones de `getHomeData().rooms` pertenecen al home de la cuenta actual, así que
   * una cuenta invitada no ve los nombres que puso el dueño. Este endpoint los devuelve para
   * el invitado (misma fuente que usa la app oficial → los nombres se sincronizan). El campo
   * llega como `roomId`; se normaliza a `id` para casar con `get_room_mapping`.
   * Tolera fallos (dispositivo propio, sin permiso…) devolviendo [].
   */
  async getSharedDeviceRooms(duid: string): Promise<Room[]> {
    try {
      const body = await this.realApiGet(`user/deviceshare/query/${duid}/rooms`);
      if (!body?.success || !Array.isArray(body.result)) return [];
      return body.result
        .map((room: any) => {
          const id = room?.id ?? room?.roomId;
          return { id: Number(id), name: String(room?.name ?? "") };
        })
        .filter((r: Room) => Number.isFinite(r.id) && r.name !== "");
    } catch {
      return [];
    }
  }

  /** Mapa duid → localKey (necesario para cifrar/descifrar mensajes). */
  static localKeyMap(home: HomeData): Map<string, string> {
    return new Map(home.devices.map((d) => [d.duid, d.localKey]));
  }
}
