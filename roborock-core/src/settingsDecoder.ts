/**
 * settingsDecoder — interpreta respuestas de ajustes a formatos legibles/accesibles.
 */

// Vida útil de cada consumible en horas (valores estándar Roborock).
const CONSUMABLE_LIFESPAN_HOURS: Record<string, { name: string; hours: number }> = {
  main_brush_work_time: { name: "Cepillo principal", hours: 300 },
  side_brush_work_time: { name: "Cepillo lateral", hours: 200 },
  filter_work_time: { name: "Filtro", hours: 150 },
  sensor_dirty_time: { name: "Sensores", hours: 30 },
};

export interface Consumable {
  key: string;
  name: string;
  percentLeft: number;
  hoursUsed: number;
}

/** Convierte los tiempos de uso (segundos) en % de vida restante. Acepta objeto o array. */
export function decodeConsumables(input: unknown): Consumable[] {
  const raw = (Array.isArray(input) ? input[0] : input) as Record<string, number> | undefined;
  if (!raw || typeof raw !== "object") return [];

  const out: Consumable[] = [];
  for (const [key, meta] of Object.entries(CONSUMABLE_LIFESPAN_HOURS)) {
    const seconds = raw[key];
    if (typeof seconds !== "number") continue;
    const lifespanSeconds = meta.hours * 3600;
    const percentLeft = Math.max(0, Math.round((1 - seconds / lifespanSeconds) * 100));
    out.push({ key, name: meta.name, percentLeft, hoursUsed: Math.round((seconds / 3600) * 10) / 10 });
  }
  return out;
}

/** Extrae un número de una respuesta tipo `[100]` o `{volume:100}`. */
export function firstNumber(input: unknown): number | null {
  if (Array.isArray(input) && typeof input[0] === "number") return input[0];
  if (typeof input === "number") return input;
  return null;
}
