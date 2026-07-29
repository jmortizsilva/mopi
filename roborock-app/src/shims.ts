/**
 * shims — polyfills globales necesarios antes de cargar el núcleo Roborock.
 *
 * Debe importarse ANTES que cualquier otro módulo (ver index.ts). El núcleo usa `Buffer`
 * como global (igual que en Node); en React Native hay que instalarlo desde el paquete `buffer`.
 * La criptografía va por react-native-quick-crypto a través de cryptoProvider (no global).
 */
import { Buffer } from "buffer";

if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}
