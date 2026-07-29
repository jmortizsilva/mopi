# Mopi (app iOS)

App accesible (VoiceOver) para controlar el **Roborock Qrevo S5V**, construida con
**Expo 54 / React Native / TypeScript**. Habla directamente con la nube de Roborock
(sin servidor intermedio), reutilizando el núcleo de protocolo de [`../roborock-core`](../roborock-core).

## Qué hace ya

- **Login** por código de email (dos pasos, accesible).
- **Estado** del robot en texto claro ("Cargando. Batería 100 por ciento. Succión: Equilibrado…").
- **Controles**: empezar, pausar, parar, volver a la base, localizar (sonido).
- **Limpieza por habitación** (un botón por estancia, con los nombres de tu casa).
- Sesión guardada en el llavero seguro (expo-secure-store); no vuelve a pedir login.

## Estado de verificación

| Capa | Verificado |
| :--- | :--- |
| Cripto, frames, login, decodificador de estado | ✅ (tests en roborock-core + typecheck) |
| Pantallas y flujo (TypeScript) | ✅ typecheck limpio |
| **Transporte MQTT sobre TLS nativo** | ⏳ **a validar en el primer build en dispositivo** |

### ⚠️ Puntos a validar en el primer build (no comprobables sin el móvil)

1. **TLS del broker**: `react-native-tcp-socket` debe confiar en la CA de Roborock. Si el
   handshake falla, hay que pasar el certificado CA en `connectTLS` (ver `src/roborock/mqttApi.ts`).
2. **AES-128-ECB en quick-crypto**: el protocolo V1 usa ECB con IV null. Si quick-crypto no lo
   soporta, hay un plan B (AES en JS). Ver `src/roborock/cryptoProvider.ts`.
3. **Cliente MQTT propio** (`src/roborock/mqtt/minimalMqtt.ts`): implementación mínima 3.1.1.
   El login/framing ya están probados en Node; el intercambio MQTT real se confirma aquí.

## Arquitectura

- `src/roborock/` — copia del núcleo (roborock-core) adaptada a RN. Solo cambian dos ficheros:
  - `cryptoProvider.ts` → usa `react-native-quick-crypto` (en vez de `node:crypto`).
  - `mqttApi.ts` + `mqtt/minimalMqtt.ts` → TLS nativo + cliente MQTT propio (en vez de mqtt.js).
  - El resto es idéntico al de roborock-core. Si cambias el protocolo allí, recópialo aquí.
- `src/screens/`, `src/ui/` — interfaz accesible.
- `src/session.ts`, `src/shims.ts` — sesión segura y polyfill de Buffer.

## Compilar y probar (sin Mac, vía EAS — como BadaBus)

Necesita cuenta de Expo/EAS y de Apple Developer (igual que tus otras apps).

```bash
npm install
npx eas login
npx eas device:create          # registra tu iPhone (una vez)
npx eas build -p ios --profile development
```

Instala el build de desarrollo en el iPhone, y luego:

```bash
npx expo start --dev-client
```

Se necesita un **development build** (no Expo Go) porque hay módulos nativos
(quick-crypto, tcp-socket).

## Desarrollo

```bash
npm run typecheck   # comprueba TypeScript
npm start           # servidor de desarrollo (requiere dev build instalado)
```
