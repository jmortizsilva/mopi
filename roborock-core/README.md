# roborock-core

Núcleo del protocolo Roborock en TypeScript, **portable a React Native**. Es la base sobre
la que se construirá la app iOS accesible para el **Roborock Qrevo S5V**.

Ver la especificación completa en [`../PROTOCOLO_ROBOROCK.md`](../PROTOCOLO_ROBOROCK.md).

## Estado actual

| Módulo | Contenido | Estado |
| :--- | :--- | :--- |
| `src/cryptoEngine.ts` | MD5, `encodeTimestamp`, AES V1/A01/B01/L01, credenciales MQTT, password | ✅ portado + tests |
| `src/messageParser.ts` | Frame binario (encode/decode + CRC32), helpers V1 (petición/respuesta) | ✅ portado + tests |
| `src/httpApi.ts` | Login REST (código email/password), firma Hawk, dispositivos/habitaciones | ✅ portado + tests |
| `src/mqttApi.ts` | Conexión al broker, topics, publicar/suscribir frames | ✅ portado |
| `src/pendingRequests.ts` | Correlación petición/respuesta por messageID + timeout | ✅ portado + tests |
| `src/roborockClient.ts` | Orquestador: login → dispositivos → MQTT → `sendCommand()` | ✅ |
| `src/cryptoProvider.ts` | Punto único de sustitución `node:crypto` → `react-native-quick-crypto` | ✅ |

**29 tests en verde** + typecheck limpio. RSA (fotos de cámara) se deja para más adelante:
no hace falta para el control básico.

## Comandos

```bash
npm install
npm test          # ejecuta los tests una vez (29)
npm run test:watch
npm run typecheck
npm run probe     # PRUEBA REAL contra tu robot (requiere ROBOROCK_EMAIL)
```

## Prueba real de extremo a extremo (`probe`)

Hace login con tu cuenta, lista tus dispositivos y pide `get_status` al robot:

```powershell
$env:ROBOROCK_EMAIL="tu@email.com"; $env:ROBOROCK_REGION="eu"; npm run probe
```

Te pedirá el **código de 6 dígitos** que Roborock envía a tu email. La sesión queda en
`examples/.session.json` (ignorado por git) para no repetir el login. Si tu robot responde,
verás su estado real (batería, estado, etc.). Confirma de paso que su `pv` es `"1.0"`.

## Portar a React Native

El código usa `node:crypto` y `Buffer`, disponibles en los tests bajo Node. En la app Expo:

1. Sustituye el contenido de `src/cryptoProvider.ts` por `react-native-quick-crypto`
   (misma API: `createHash`, `createCipheriv`, `createHmac`, `randomBytes`).
2. Añade el polyfill global de `Buffer` (paquete `buffer`).
3. `crc-32` funciona igual (JS puro).
4. Requiere **dev client + EAS Build** (los módulos nativos no corren en Expo Go).

## Siguiente paso

Portar `httpApi` (login por código de email → `UserData`/`rriot` → lista de dispositivos con
`duid` + `localKey` + `pv`) y `mqttApi` (conectar al broker, suscribir/publicar topics).
Objetivo del primer hito de red: enviar `get_status` y leer el estado real del robot.
