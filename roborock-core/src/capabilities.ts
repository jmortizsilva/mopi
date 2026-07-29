/**
 * capabilities — qué funciones tiene REALMENTE el robot, para no construir controles que no
 * aplican. La guía del proyecto (GUIA-ACCESIBILIDAD-RN.md §7) lo exige: si el aparato no tiene
 * una función, ese control NO se construye (no basta con ocultarlo).
 *
 * Se combinan dos fuentes, por eso es lógica pura y testeable sin dispositivo:
 *   1. Runtime: lo que respondió el robot en dumpSettings(). Un ajuste de la estación existe si
 *      su GET devolvió un objeto usable (no {error} ni vacío). Funciona con cualquier modelo.
 *   2. Tabla por modelo: corrige lo que el runtime no distingue (comandos que el robot acepta
 *      pero cuya función no tiene). Solo se siembra lo conocido.
 */

export interface DeviceCapabilities {
  /** Base con auto-vaciado del depósito de polvo. */
  autoEmptyDock: boolean;
  /** Estación que seca la mopa. */
  mopDrying: boolean;
  /** Estación que lava la mopa (intensidad de lavado). */
  mopWashStation: boolean;
}

const NONE: DeviceCapabilities = { autoEmptyDock: false, mopDrying: false, mopWashStation: false };

/** ¿La respuesta de un GET de ajuste es un objeto usable (no {error}, con alguno de los campos)? */
function hasUsableObject(value: unknown, ...fields: string[]): boolean {
  const obj = Array.isArray(value) ? value[0] : value;
  if (!obj || typeof obj !== "object") return false;
  if ("error" in (obj as Record<string, unknown>)) return false;
  if (fields.length === 0) return Object.keys(obj as object).length > 0;
  return fields.some((f) => (obj as Record<string, unknown>)[f] !== undefined);
}

/** Señales de capacidad deducidas de lo que respondió el robot (dumpSettings). */
export function capabilitiesFromDump(dump: Record<string, unknown>): DeviceCapabilities {
  return {
    autoEmptyDock:
      hasUsableObject(dump.dust_collection_switch, "status") || hasUsableObject(dump.dust_collection_mode, "mode"),
    mopDrying: hasUsableObject(dump.dryer_setting, "status"),
    mopWashStation:
      hasUsableObject(dump.wash_towel_mode, "wash_mode") || hasUsableObject(dump.smart_wash_params, "wash_mode"),
  };
}

/**
 * Tabla de respaldo por modelo. Solo se pone lo que el runtime no distingue bien; lo que no se
 * declara aquí se decide por runtime.
 */
export const MODEL_CAPABILITIES: Record<string, Partial<DeviceCapabilities>> = {
  // Qrevo S5V: base todo-en-uno (auto-vaciado + secado + lavado de mopa).
  "roborock.vacuum.a170": { autoEmptyDock: true, mopDrying: true, mopWashStation: true },
};

/**
 * Capacidades finales: runtime como base y la tabla del modelo como corrección encima. Sin dump
 * (aún cargando) ni modelo conocido, todo queda en false: no se muestra hasta saberlo.
 */
export function resolveCapabilities(
  model: string | null,
  dump: Record<string, unknown> | null,
): DeviceCapabilities {
  const base = dump ? capabilitiesFromDump(dump) : { ...NONE };
  const table = (model && MODEL_CAPABILITIES[model]) || {};
  return { ...base, ...table };
}
