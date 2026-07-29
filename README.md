# Mopi 🧹

**Controla tu robot aspirador Roborock de forma sencilla y totalmente accesible con VoiceOver.**

Mopi es una app de iOS (Expo / React Native) pensada desde cero para lectores de pantalla.
Nació porque la app oficial de Roborock resulta difícil de usar con VoiceOver: aquí todo son
botones grandes, textos claros, estados leídos en voz alta y confirmación por vibración.

> ℹ️ Mopi es una aplicación **independiente y no oficial**. No está afiliada, patrocinada ni
> respaldada por Roborock. «Roborock» es una marca de sus respectivos propietarios y se menciona
> solo para indicar compatibilidad.

---

## ✨ Qué hace

- **Estado** del robot en texto claro: batería, en la base, **secado de la mopa con tiempo
  restante**, avisos (falta de agua, error de base…).
- **Control**: empezar, pausar y parar la limpieza; volver a la base; localizar (sonido).
- **Limpieza por habitación**, con los nombres reales de tu casa.
- **Modo de limpieza**: aspirar y fregar, o solo aspirar.
- **Configuración**: succión, nivel de agua, modo de fregado, secado automático de mopa,
  auto-vaciado, intensidad de lavado, volumen, No molestar (con horario), bloqueo infantil,
  luz LED, refuerzo en alfombra, evitar obstáculos.
- **Consumibles**: vida de cepillos/filtro/sensores y reinicio al cambiarlos.

Todo con foco en la **accesibilidad**: roles y estados correctos, controles en un solo gesto,
región en vivo para el estado y avisos hablados + vibración al aplicar cambios.

## 🧩 Estructura del repositorio

| Carpeta | Qué es |
| :--- | :--- |
| [`roborock-core/`](roborock-core) | Núcleo del protocolo Roborock en TypeScript (cripto, frames binarios, login, MQTT, decodificadores). Portable y **con tests** (vitest). |
| [`roborock-app/`](roborock-app) | La app **Mopi** (Expo / React Native / TypeScript). |
| [`docs/`](docs) | Web del proyecto (página de inicio + política de privacidad) servida con GitHub Pages. |
| [`PROTOCOLO_ROBOROCK.md`](PROTOCOLO_ROBOROCK.md) | Documento técnico del protocolo, destilado para poder reimplementarlo. |

## 🔧 Cómo funciona (resumen técnico)

Roborock no tiene API oficial pública; Mopi habla **directamente con la nube de Roborock**
reimplementando su protocolo (ingeniería inversa de la comunidad):

1. **Login REST** regional (por código de email) → token + credenciales `rriot`.
2. **Firma Hawk** para descubrir dispositivos, habitaciones y `localKey`.
3. **MQTT sobre TLS** (puerto 8883) como canal de control en tiempo real.
4. Cada mensaje es un **frame binario cifrado** (AES) con CRC32.

Decisiones de fiabilidad para React Native:
- **Cliente MQTT 3.1.1 mínimo propio** sobre `react-native-tcp-socket` (evita los polyfills
  frágiles de mqtt.js).
- **AES en JS puro** (`aes-js`), validado byte a byte contra `node:crypto`, porque
  `react-native-quick-crypto` no cifra AES como necesita el protocolo V1.
- Sin servidores propios: los datos solo viajan entre tu iPhone y Roborock.

## 🛠️ Desarrollo

Requiere Node y, para compilar iOS, una cuenta de Expo (EAS) y de Apple.

```bash
# Núcleo (tests + typecheck)
cd roborock-core && npm install && npm test && npm run typecheck

# App
cd roborock-app && npm install && npm run typecheck
npx expo start --dev-client   # desarrollo con recarga (requiere un dev build instalado)
```

Prueba real del núcleo contra tu robot (login → estado → habitaciones → ajustes):

```bash
cd roborock-core
ROBOROCK_EMAIL="tu@correo.com" npm run probe
```

## 📦 Compilar (sin Mac, vía EAS)

```bash
cd roborock-app
npx eas build -p ios --profile development   # dev build (para desarrollar con Metro)
npx eas build -p ios --profile preview       # standalone (funciona sin el PC)
npx eas build -p ios --profile production --auto-submit   # TestFlight
```

## 📱 Compatibilidad

Funciona con la mayoría de robots Roborock que usan el **protocolo V1** (series S y la mayoría
de Q / Qrevo). Según el modelo, algunas funciones concretas pueden no estar disponibles.
Modelos con otros protocolos (B01, A01, L01) aún no están soportados.

Probado en: **Roborock Qrevo S5V** (`roborock.vacuum.a170`).

## 🔒 Privacidad

Mopi **no tiene servidores propios** y no recopila datos. Tus credenciales viajan solo a
Roborock para autenticarte, y la sesión se guarda cifrada en el llavero del dispositivo.
Ver la [política de privacidad](docs/privacidad.html).

## 🙏 Créditos

La reimplementación del protocolo se apoya en el trabajo de la comunidad, especialmente:
- [python-roborock](https://github.com/Python-roborock/python-roborock)
- [ioBroker.roborock](https://github.com/copystring/ioBroker.roborock)

## 📄 Licencia

Pendiente de decidir. Si quieres reutilizar algo, abre una [incidencia en GitHub](https://github.com/jmortizsilva/mopi/issues).
