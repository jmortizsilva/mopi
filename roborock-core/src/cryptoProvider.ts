/**
 * Proveedor centralizado de primitivas criptográficas.
 *
 * En Node (tests) usamos `node:crypto`.
 *
 * 👉 En React Native, sustituye ESTE fichero por:
 *
 *     import QuickCrypto from "react-native-quick-crypto";
 *     export const crypto = QuickCrypto;
 *
 * La API que usamos (createHash, createCipheriv, createDecipheriv, createHmac,
 * randomBytes) es idéntica en `react-native-quick-crypto`, así que el resto del
 * código no cambia. Requiere dev client + EAS Build (no funciona en Expo Go).
 */
import * as nodeCrypto from "node:crypto";

export const crypto = nodeCrypto;
