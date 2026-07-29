# Protocolo Roborock — Documento técnico para app iOS (Expo/React Native)

> Objetivo: reimplementar en **TypeScript / React Native** el control de la aspiradora
> **Roborock Qrevo S5V** hablando directamente con la nube de Roborock (Opción A:
> app autónoma, sin servidor intermedio tipo Home Assistant).
>
> Fuente destilada del adaptador **ioBroker.roborock** (TypeScript, JavaScript-friendly).
> Referencias cruzables: `python-roborock` (usada por Home Assistant).
> Roborock **no** ofrece API oficial: todo esto es ingeniería inversa de la comunidad.

---

## 0. Resumen de la arquitectura

Hay **dos canales** y **cuatro fases**:

```
Fase 1  REST Login  ──▶  token + credenciales "rriot"
Fase 2  REST "Real API" (firma Hawk)  ──▶  lista de dispositivos (duid + localKey), habitaciones
Fase 3  MQTT sobre TLS (puerto 8883)  ──▶  canal de control en tiempo real
Fase 4  Enviar comando (frame binario cifrado) / recibir estado
```

- **REST** solo se usa para autenticarte y descubrir dispositivos.
- **El control real (arrancar, parar, ir al dock, estado, habitaciones…) va por MQTT.**
- Cada mensaje MQTT es un **frame binario propietario** con cabecera + payload **cifrado (AES)** + CRC32.

Piezas del adaptador de referencia (equivalentes a portar):

| Fichero ioBroker | Qué hace | Prioridad de port |
| :--- | :--- | :--- |
| `httpApi.ts` | Login REST + Hawk + home data | **Alta** |
| `cryptoEngine.ts` | AES/MD5/HMAC/RSA | **Alta** (núcleo) |
| `messageParser.ts` | Frame binario (encode/decode) | **Alta** (núcleo) |
| `mqttApi.ts` | Conexión y topics MQTT | **Alta** |
| `requestsHandler.ts` | Cola de peticiones + respuestas | Media |
| `localApi.ts` | Control local por TCP (LAN) | Baja (opcional) |
| `map/*` | Decodificación de mapas | Baja (fase 2 del proyecto) |

---

## 1. Constantes y secretos (extraídos del binario `librrcodec.so`)

```ts
// Sal global usada en la derivación de claves V1 / L01
const SALT = "TXdfu$jyZ#TZHsg4";

// Sal específica para el IV del protocolo B01
const SALT_B01 = "5wwh9ikChRjASpMU8cxg7o1d2E";

// Cadena fija usada para el IV del protocolo A01
const A01_IV_SEED = "726f626f726f636b2d67a6d6da"; // "roborock-g..." en hex

// Cabecera del frame binario
// version(3) + seq(4) + random(4) + timestamp(4) + protocol(2) + payloadLen(2) = 19 bytes
const HEADER_LEN = 19;
const CRC32_LEN  = 4;
```

Headers HTTP que imita la app oficial (deben enviarse tal cual):

```ts
// loginApi (base regional)
header_clientid : base64( MD5( username + clientID ) )   // clientID = id de dispositivo estable que TÚ generas
header_appversion : "4.57.02"
header_clientlang : "de"
header_phonemodel : "Pixel 9 Pro XL"
header_phonesystem: "Android"

// realApi (base rriot.r.a)
x-iotsdk-version : "1.0.1"
x-app-name       : "com.roborock.smart"
x-app-version-code: "100834"
x-app-version-name: "4.57.02"
x-uid            : rriot.u
User-Agent       : "UA=RRSDKAndroid/1.0.1"
```

> `clientID` es un identificador de dispositivo que generas una vez (p. ej. un UUID) y **persistes** (AsyncStorage). Debe ser estable entre arranques.

---

## 2. Fase 1 — Login REST

### 2.1 Servidores por región

| Región | Base URL login | country | countryCode |
| :--- | :--- | :--- | :--- |
| eu | `https://euiot.roborock.com` | DE | 49 |
| us | `https://usiot.roborock.com` | US | 1 |
| cn | `https://cniot.roborock.com` | CN | 86 |
| asia | `https://api.roborock.com` | SG | 65 |

> Usa la **misma región** con la que registraste la cuenta en la app. Para España lo normal es **eu**.

### 2.2 Pasos del login

**Paso A — Obtener clave de firma `k`**

```
POST {base}/api/v3/key/sign?s={s}
  s = nonce aleatorio de 16 caracteres (base64 recortado, + → X, / → Y)
→ respuesta: { data: { k } }     // k tiene 16 caracteres
```

**Paso B — Autenticación (dos variantes)**

*Variante 1: por contraseña*
```
password_cifrada = encryptPassword(password, k)      // ver §4.7
POST {base}/api/v4/auth/email/login/pwd
  headers: x-mercy-k: k, x-mercy-ks: s
  body (x-www-form-urlencoded): email, password=password_cifrada, majorVersion=14, minorVersion=0
```
Si responde `code === 2031` ⇒ la cuenta exige 2FA: cae a la variante 2.

*Variante 2: por código de email (2FA)* — **la más fiable**
```
1) POST {base}/api/v4/email/code/send      body: type=login, email, platform=""
   (Roborock envía un código de 6 dígitos al email)
2) Regenera s y k (Paso A otra vez, para que no caduque)
3) POST {base}/api/v4/auth/email/login/code
     headers: x-mercy-k: k, x-mercy-ks: s
     body: country, countryCode, email, code=<6 dígitos>, majorVersion=14, minorVersion=0
```

**Respuesta de login (la estructura clave de todo el sistema):**

```ts
interface UserData {
  token: string;              // Bearer para la loginApi
  rriot: {
    u: string;                // user id  (se usa en topics MQTT, Hawk y x-uid)
    s: string;                // session   (Hawk)
    h: string;                // hmac key  (Hawk)  ← clave HMAC-SHA256
    k: string;                // key       (deriva credenciales MQTT)
    r: {
      a: string;              // base URL de la "Real API"  (ej. https://api-eu.roborock.com)
      m: string;              // URL del broker MQTT        (ej. ssl://mqtt-eu-xx.roborock.com:8883)
    };
  };
}
```

> **Persiste `UserData`** (AsyncStorage). Mientras el token valga, te saltas todo el login en
> arranques siguientes. Si la Real API responde 401 → token caducado → repite el login.

### 2.3 Descubrir la casa y los dispositivos

```
GET {base}/api/v1/getHomeDetail        (loginApi, Authorization: token)
→ data.rrHomeId                        // id numérico de tu casa
```

Luego, contra la **Real API** (con firma Hawk, §3):

```
GET {rriot.r.a}/v3/user/homes/{rrHomeId}
→ result.devices[]  : { duid, localKey, productId, name, online, pv, sn, ... }
  result.products[] : { id, model, category, name }
  result.rooms[]    : { id, name }
```

- **`duid`** = id del robot (va en el topic MQTT).
- **`localKey`** = clave AES de ese robot (¡el secreto para cifrar/descifrar sus mensajes!).
- **`pv`** = versión de protocolo del dispositivo: `"1.0"`, `"A01"`, `"B01"`, `"L01"`…
  👉 **El Qrevo S5V casi con seguridad es `pv = "1.0"` (protocolo V1).** Confírmalo en runtime:
  determina la ruta de cifrado por `device.pv`.

> **Habitaciones de un dispositivo COMPARTIDO.** `result.rooms[]` son las de TU casa. Si el robot
> te lo han compartido (aparece en `receivedDevices`, no en `devices`), sus habitaciones NO están
> ahí y `get_room_mapping` cae a "Habitación N". Los nombres del dueño se leen aparte (misma
> fuente que la app oficial → se sincronizan):
> ```
> GET {rriot.r.a}/user/deviceshare/query/{duid}/rooms   (Hawk)
> → result[] : { roomId, name }     // normaliza roomId → id para casar con get_room_mapping
> ```

---

## 3. Firma Hawk (para la "Real API")

Toda petición a `rriot.r.a` se firma en un interceptor:

```ts
const timestamp = Math.floor(Date.now() / 1000);
const nonce = randomBase64(6);                 // 6 chars, + → X, / → Y
const urlPath = pathname + search;             // ej. "/v3/user/homes/123"
const prestr = [u, s, nonce, timestamp, md5hex(urlPath), "", ""].join(":");
const mac = base64( HMAC_SHA256(key = h, data = prestr) );

headers.Authorization =
  `Hawk id="${u}", s="${s}", ts="${timestamp}", nonce="${nonce}", mac="${mac}"`;
```

> ⚠️ **El reloj del dispositivo debe estar bien.** Si hay >60 s de desfase, la Real API
> rechaza la firma con 401. (El adaptador incluso aborta y pide corregir la hora).

---

## 4. Motor criptográfico (`cryptoEngine`)

> Para el **Qrevo S5V (V1)** solo necesitas §4.2 y §4.5 (MD5 + AES-128-ECB). El resto es
> para otros modelos o para funciones avanzadas (fotos con cámara → RSA).

### 4.1 Utilidades base
```ts
md5bin(str)  = MD5(str) → Buffer(16)
md5hex(str)  = MD5(str) → hex string
```

### 4.2 `encodeTimestamp` (reordenado de dígitos hex del timestamp)
```ts
function encodeTimestamp(ts: number): string {
  const hex = ts.toString(16).padStart(8, "0").split("");
  return [5, 6, 3, 7, 1, 2, 0, 4].map(i => hex[i]).join("");
}
```

### 4.3 Derivación de credenciales MQTT (a partir de `rriot`)
```ts
mqttUser     = md5hex(rriot.u + ":" + rriot.k).substring(2, 10);   // 8 chars
mqttPassword = md5hex(rriot.s + ":" + rriot.k).substring(16);      // 16 chars
clientId     = mqttUser;
brokerUrl    = rriot.r.m;   // ssl://...:8883
```

### 4.4 Derivación de IV para B01 (solo si tu robot fuese B01)
```ts
// key = localKey (utf8, 16 bytes) ; IV:
rStr = uint32BE(random).toString("hex");
iv   = MD5(rStr + SALT_B01).hex.substring(9, 25);   // 16 chars utf8
// AES-128-CBC, PKCS7
```

### 4.5 Protocolo V1 (AES-128-ECB) — **el del Qrevo S5V**
```ts
key = md5bin( encodeTimestamp(ts) + localKey + SALT );   // 16 bytes
// encriptar: AES-128-ECB, sin IV, padding PKCS7 (por defecto)
encryptV1(payload, localKey, ts) = AES_ECB_encrypt(key, payload);
decryptV1(payload, localKey, ts) = AES_ECB_decrypt(key, payload);
```
> `ts` es el mismo timestamp (segundos) que va en la cabecera del frame. Al descifrar una
> respuesta, usa el `timestamp` que viene en su cabecera.

### 4.6 Otros protocolos (referencia)
- **A01** (AES-128-CBC): `key = localKey (utf8)`, `iv = md5hex(uint32BE(random).hex + A01_IV_SEED).substring(8,24)`.
- **L01** (AES-256-GCM): `key = SHA256(encodeTimestamp(ts)+localKey+SALT)`, IV/AAD derivados de seq/random/ts/nonces.
- **B01**: ver §4.4.

### 4.7 Cifrado de contraseña (login por password)
```ts
derivedKey = k.slice(4) + k.slice(0, 4);          // k son 16 chars
encryptPassword = base64( AES_128_ECB_encrypt(derivedKey_utf8, password) );
```

---

## 5. Frame binario Roborock (`messageParser`)

### 5.1 Estructura (big-endian)
```
offset  bytes  campo
0       3      version   ("1.0" en ASCII para V1)
3       4      seq       (uint32, id de transporte 1..0xFFFF, incremental)
7       4      random    (uint32 aleatorio; en V1 no afecta a la clave)
11      4      timestamp (uint32, segundos)
15      2      protocol  (uint16)   ← 101 = petición RPC por MQTT ; 102 = respuesta
17      2      payloadLen(uint16)
19      N      payload   (bytes cifrados según §4)
19+N    4      crc32     (uint32, CRC-32 de TODO lo anterior)
```

- **CRC**: `crc32(buffer[0 .. len-4])` comparado con los últimos 4 bytes.
- Un mismo buffer MQTT puede traer **varios frames concatenados**: parséalos en bucle.
- `protocol === 1` es un handshake sin payload (no lo necesitas para el flujo cloud básico).

### 5.2 Números de protocolo relevantes
| protocol | significado |
| :--- | :--- |
| `101` | Petición RPC (app → robot) por MQTT / respuesta get_photo |
| `102` | **Respuesta RPC** (robot → app) — aquí llegan los resultados de tus comandos |
| `300/301/302` | Datos de mapa (fase avanzada) |
| `500` | Eventos/estado push |

### 5.3 Construcción del payload RPC (V1)
```ts
const inner = { id: messageID, method, params };          // p.ej. { id: 12345, method: "app_start", params: [] }
const timestamp = Math.floor(Date.now()/1000);
const payloadJson = JSON.stringify({ dps: { "101": JSON.stringify(inner) }, t: timestamp });
// luego: encryptV1(payloadJson, localKey, timestamp) → frame binario con protocol=101
```
La respuesta llega en `protocol=102`, con forma `{ dps: { "102": "<json string>" }, t }`, donde el
JSON interno es `{ id, result }` (haz match del `id` con tu petición pendiente).

> **`messageID`**: entero incremental que TÚ generas (p. ej. contador 1..9999). Sirve para
> correlacionar respuesta con petición. **`seq`** de la cabecera es un contador de transporte aparte.

---

## 6. MQTT — conexión y topics (`mqttApi`)

```ts
// Opciones de conexión
options = { clientId: mqttUser, username: mqttUser, password: mqttPassword,
            keepalive: 30, clean: true };
client = mqttConnect(brokerUrl /* rriot.r.m, ssl://...:8883 */, options);

// Suscripción (recibir del robot):
subscribe(`rr/m/o/${rriot.u}/${mqttUser}/#`);

// Publicación (enviar al robot):
publish(`rr/m/i/${rriot.u}/${mqttUser}/${duid}`, frameBinario, { qos: 1 });
```

- `rr/m/o/...` = **o**utbound del robot (lo que **recibes**).
- `rr/m/i/...` = **i**nbound al robot (lo que **envías**), acabado en el `duid` concreto.
- En `message`, el **último segmento del topic es el `duid`**. Decodifica el buffer con
  `decodeMsg` (§5) y procesa cada frame.

---

## 7. Flujo completo de un comando (ejemplo `app_start`)

```
1. messageID = nextId()
2. inner   = { id: messageID, method: "app_start", params: [] }
3. payload = JSON.stringify({ dps: { "101": JSON.stringify(inner) }, t: ts })
4. cifrado = encryptV1(payload, localKey, ts)
5. frame   = [ "1.0" | seq | random | ts | 101 | len | cifrado | crc32 ]
6. publish("rr/m/i/{u}/{mqttUser}/{duid}", frame, qos 1)
7. respuesta llega en "rr/m/o/{u}/{mqttUser}/{duid}", protocol 102,
   descifras con decryptV1 usando el ts de SU cabecera, parseas dps["102"],
   y casas result con messageID.
```

---

## 8. Referencia de comandos

### 8.1 Comandos V1 (los del Qrevo S5V) — `method` + `params`
| method | params | descripción |
| :--- | :--- | :--- |
| `get_status` | `[]` | Estado general (batería, estado, modo…). Ideal para el primer test. |
| `app_start` | `[]` | Empezar limpieza |
| `app_stop` | `[]` | Parar |
| `app_pause` | `[]` | Pausar |
| `app_charge` | `[]` | Volver al dock |
| `app_spot` | `[]` | Limpieza puntual |
| `find_me` | `[]` | Que emita sonido para localizarlo |
| `get_room_mapping` | `[]` | Lista de habitaciones (id ↔ segmento) |
| `app_segment_clean` | `[{ "segments":[16,17], "repeat":1 }]` | Limpiar habitaciones concretas |
| `app_zoned_clean` | `[[x1,y1,x2,y2,veces]]` | Limpiar zona por coordenadas |
| `set_custom_mode` | `[n]` | Potencia de succión |
| `set_water_box_custom_mode` | `[n]` | Nivel de agua/fregado |
| `get_consumable` | `[]` | Estado de consumibles (filtros, cepillos) |
| `get_clean_summary` | `[]` | Histórico de limpiezas |

> En los Qrevo (vacuum+mop), `app_segment_clean` tiene matices para elegir aspirar vs. fregar;
> contrasta parámetros con `python-roborock` y con logs reales de tu robot.

### 8.2 Comandos B01 (solo si tu robot resultara ser B01)
Control por propiedades: `prop.set { wind:1-5, water:1-3, mode:0/1/2, child_lock:0/1 }`,
acciones vía `prop.set { status: N }` (start=1, stop=2, pause=10, charge=6) y `service.*`.

---

## 9. Adaptación a React Native / Expo (lo específico de tu stack)

El código de referencia usa APIs de Node (`Buffer`, `node:crypto`, `mqtt`). En RN necesitas equivalentes:

| Necesidad | Node (ioBroker) | React Native / Expo |
| :--- | :--- | :--- |
| Buffers | `Buffer` | paquete **`buffer`** (polyfill) |
| Hash/AES/HMAC | `node:crypto` | **`react-native-quick-crypto`** (JSI, casi drop-in: `createHash`, `createCipheriv` ECB/CBC/GCM, `createHmac`) |
| CRC-32 | `crc-32` | **`crc-32`** (JS puro, funciona igual) |
| Parseo binario | `binary-parser` | manual con `DataView`/`Buffer` (recomendado; evitas dependencia) |
| MQTT+TLS 8883 | `mqtt` | **`mqtt`** (mqtt.js) sobre **`react-native-tcp-socket`** vía `streamBuilder`, para conservar payloads **binarios** (Buffer) |
| RSA (solo fotos) | `node-forge` | `node-forge` (JS puro) — **aplázalo**, no hace falta para control básico |
| REST | `axios` | `axios` o `fetch` nativo |

**Puntos críticos / gotchas:**
1. **MQTT binario**: evita librerías que solo manejan strings (p. ej. algunas basadas en Paho).
   Necesitas enviar/recibir **`Buffer` crudo**. La combinación `mqtt.js` + `react-native-tcp-socket`
   (con un `streamBuilder` que abre socket TLS al 8883) es la vía probada para binario.
2. **Módulos nativos** (`quick-crypto`, `tcp-socket`) ⇒ requieren **dev client + EAS Build**
   (que ya usas). No funcionan en Expo Go.
3. **AES-ECB**: `react-native-quick-crypto` lo soporta; verifica que el **padding PKCS7** por
   defecto coincide (el mismo texto → mismo ciphertext que Node).
4. **Reloj**: asegura hora correcta para la firma Hawk (§3).
5. **Rate limiting**: no machaques la nube (bans de IP). Encola peticiones y respeta un
   intervalo mínimo, como hace el adaptador.

---

## 10. Plan de prototipo mínimo (orden recomendado)

Construye y valida por capas, cada una verificable de forma aislada:

1. **`cryptoEngine.ts`** (port) + **test unitario** con un vector conocido: cifra y descifra
   V1 y comprueba que `decrypt(encrypt(x)) === x`. (Sin red todavía.)
2. **`messageParser.ts`** (port): construye un frame, parpea, valida CRC. Test de ida y vuelta.
3. **`httpApi` login**: consigue `UserData` (empieza por 2FA email, §2.2 var.2) y persístelo.
   Log de `rriot` y de la lista de dispositivos (`duid`, `localKey`, `pv`, `model`).
   ✅ *Hito: ves tu Qrevo S5V listado y confirmas su `pv`.*
4. **Home data / rooms** vía Hawk (§3): imprime habitaciones.
5. **MQTT connect** (§6): conecta, suscríbete, confirma "connected".
6. **Primer comando de lectura**: `get_status` → recibe protocol 102 → descífralo → imprime estado.
   ✅ *Hito: lees el estado real del robot.*
7. **Primer comando de acción**: `find_me` (inofensivo, suena) y luego `app_charge`.
   ✅ *Hito: el robot reacciona a tu app.*
8. Ya con el "motor" validado → montas encima la **UI accesible** (Expo/RN, VoiceOver),
   igual que en BadaBus/EasyWeather.

---

## 11. Notas legales y de riesgo

- Es **ingeniería inversa** de un protocolo no público: úsalo con **tu propia cuenta y tu robot**.
- El login de terceros puede disparar **2FA** y, si abusas, **bans temporales de IP** → respeta rate limits.
- Roborock **podría cambiar** el protocolo en el futuro; al ir HA/ioBroker por delante,
  tendrías dónde mirar los cambios.
- Guarda credenciales de forma segura (Keychain iOS vía `expo-secure-store`), nunca en claro.

---

## 12. Fuentes

- ioBroker.roborock — https://github.com/copystring/ioBroker.roborock
  (ficheros clave: `src/lib/cryptoEngine.ts`, `messageParser.ts`, `httpApi.ts`, `mqttApi.ts`)
- python-roborock — https://github.com/Python-roborock/python-roborock
- Integración Roborock de Home Assistant — https://www.home-assistant.io/integrations/roborock/
- Librerías RN: `react-native-quick-crypto`, `react-native-tcp-socket`, `mqtt`, `buffer`, `crc-32`
