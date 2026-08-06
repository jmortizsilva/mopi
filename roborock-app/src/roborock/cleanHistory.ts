/**
 * cleanHistory — decodifica el historial de limpiezas del robot.
 *
 * `get_clean_summary` da los totales + los ids (marcas de tiempo) de cada limpieza; `get_clean_record`
 * con un id da el detalle de esa limpieza. Los formatos varían entre firmwares (array u objeto), así
 * que el parseo es defensivo. Área en la misma unidad que `clean_area` del estado (mm² → m²).
 */

export interface ResumenLimpieza {
  totalDuracionSeg: number;
  totalAreaM2: number;
  totalLimpiezas: number;
  ids: number[];
}

export interface RegistroLimpieza {
  inicio: number; // marca de tiempo (segundos)
  fin: number;
  duracionSeg: number;
  areaM2: number;
  error: number;
  completada: boolean;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const mm2aM2 = (v: unknown): number => Math.round((num(v) / 1_000_000) * 100) / 100;

/** Resumen: array `[tiempo, area, cuenta, [ids]]` u objeto `{clean_time, clean_area, clean_count, records}`. */
export function decodeCleanSummary(input: unknown): ResumenLimpieza {
  const raw = Array.isArray(input) && input.length === 1 && typeof input[0] === "object" ? input[0] : input;

  if (Array.isArray(raw)) {
    const ids = Array.isArray(raw[3]) ? (raw[3] as unknown[]).map(num) : [];
    return { totalDuracionSeg: num(raw[0]), totalAreaM2: mm2aM2(raw[1]), totalLimpiezas: num(raw[2]), ids };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const ids = Array.isArray(o.records) ? (o.records as unknown[]).map(num) : [];
    return {
      totalDuracionSeg: num(o.clean_time),
      totalAreaM2: mm2aM2(o.clean_area),
      totalLimpiezas: num(o.clean_count) || ids.length,
      ids,
    };
  }
  return { totalDuracionSeg: 0, totalAreaM2: 0, totalLimpiezas: 0, ids: [] };
}

/** Registro: `[[inicio, fin, duracion, area, error, completada, ...]]` o el array interno directo. */
export function decodeCleanRecord(input: unknown): RegistroLimpieza | null {
  let r = input;
  if (Array.isArray(r) && Array.isArray(r[0])) r = r[0]; // desenvolver [[...]]
  if (!Array.isArray(r) || r.length < 4) return null;
  return {
    inicio: num(r[0]),
    fin: num(r[1]),
    duracionSeg: num(r[2]),
    areaM2: mm2aM2(r[3]),
    error: num(r[4]),
    completada: num(r[5]) === 1,
  };
}
