/**
 * Anuncios de voz para VoiceOver.
 *
 * Regla del proyecto: solo se anuncian cambios de estado importantes (error, aviso, resultado
 * de una acción). La telemetría NO se canta en cada actualización: se lee al enfocar el valor.
 *
 * OJO con la versión de RN. La guía dice de pasar `priority: 'high'` para que un anuncio no se
 * corte, pero en RN 0.81 el módulo nativo de iOS SOLO lee `queue` (verificado en
 * RCTAccessibilityManager.mm 0.81.5); `priority` no se cablea hasta una versión posterior. Se
 * pasa igualmente —el nativo ignora las claves que no usa— para que active solo al actualizar RN.
 * Mientras tanto, "importante" = sin `queue` (se emite ya); si el foco va a moverse, moverlo antes.
 *
 * (Espejo de comun/codigo/accesibilidad/anuncios.ts para no cruzar paquetes.)
 */
import { AccessibilityInfo } from "react-native";

type OpcionesAnuncio = { queue?: boolean; priority?: "high" | "default" | "low" };

function anunciarCon(mensaje: string, opciones: OpcionesAnuncio): void {
  // El tipado de RN 0.81 solo declara { queue }; el JS reenvía el objeto entero al nativo.
  AccessibilityInfo.announceForAccessibilityWithOptions(mensaje, opciones as { queue?: boolean });
}

/** Informativo: espera turno y no pisa nada. Para avisos que perderse no tiene consecuencias. */
export function anunciar(mensaje: string): void {
  anunciarCon(mensaje, { queue: true, priority: "low" });
}

/** Resultado de acción o error: se emite ya (con RN ≥ ~0.86 además gana prioridad alta). */
export function anunciarImportante(mensaje: string): void {
  anunciarCon(mensaje, { priority: "high" });
}
