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

/** Primer array formado solo por números (los ids de limpieza pueden venir bajo distintas claves). */
function primerArrayDeNumeros(valores: unknown[]): number[] {
  const arr = valores.find((v) => Array.isArray(v) && (v as unknown[]).every((x) => typeof x === "number"));
  return arr ? (arr as unknown[]).map(num) : [];
}

/**
 * Resumen: array `[tiempo, area, cuenta, [ids]]` u objeto `{clean_time, clean_area, clean_count,
 * records}`. Los ids se buscan donde estén (no se fía de un índice/clave fijos, que cambian entre
 * firmwares).
 */
export function decodeCleanSummary(input: unknown): ResumenLimpieza {
  const raw = Array.isArray(input) && input.length === 1 && typeof input[0] === "object" ? input[0] : input;

  if (Array.isArray(raw)) {
    return {
      totalDuracionSeg: num(raw[0]),
      totalAreaM2: mm2aM2(raw[1]),
      totalLimpiezas: num(raw[2]),
      ids: primerArrayDeNumeros(raw),
    };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const ids = Array.isArray(o.records) ? (o.records as unknown[]).map(num) : primerArrayDeNumeros(Object.values(o));
    return {
      totalDuracionSeg: num(o.clean_time),
      totalAreaM2: mm2aM2(o.clean_area),
      totalLimpiezas: num(o.clean_count) || ids.length,
      ids,
    };
  }
  return { totalDuracionSeg: 0, totalAreaM2: 0, totalLimpiezas: 0, ids: [] };
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function deObjeto(o: Record<string, unknown>): RegistroLimpieza {
  return {
    inicio: num(o.begin),
    fin: num(o.end),
    duracionSeg: num(o.duration),
    areaM2: mm2aM2(o.area),
    error: num(o.error),
    completada: num(o.complete) === 1,
  };
}

/**
 * Registro de una limpieza, en cualquiera de los tres formatos que conoce python-roborock
 * (`CleanRecordConverter`):
 * - lista de números `[inicio, fin, duracion, area, error, completada, ...]`, envuelta o no en otra;
 * - objeto `{begin, end, duration, area, error, complete, ...}`, envuelto o no en una lista;
 * - lista de objetos, uno por tramo de la misma limpieza: se juntan como hace python-roborock
 *   (inicio del primero, el resto del último, duración y área sumadas).
 * Antes solo se entendía el primero, y con los objetos el historial salía vacío sin avisar.
 */
export function decodeCleanRecord(input: unknown): RegistroLimpieza | null {
  let r = input;
  if (Array.isArray(r) && r.length === 1) r = r[0]; // desenvolver [x]
  if (esObjeto(r)) return deObjeto(r);
  if (Array.isArray(r) && r.length > 0 && r.every(esObjeto)) {
    const tramos = (r as Record<string, unknown>[]).map(deObjeto);
    const ultimo = tramos[tramos.length - 1];
    const areaMm2 = (r as Record<string, unknown>[]).reduce((t, o) => t + num(o.area), 0);
    return {
      ...ultimo,
      inicio: tramos[0].inicio,
      duracionSeg: tramos.reduce((t, x) => t + x.duracionSeg, 0),
      areaM2: mm2aM2(areaMm2),
    };
  }
  if (!Array.isArray(r) || r.length < 4 || !r.slice(0, 4).every((x) => typeof x === "number")) return null;
  return {
    inicio: num(r[0]),
    fin: num(r[1]),
    duracionSeg: num(r[2]),
    areaM2: mm2aM2(r[3]),
    error: num(r[4]),
    completada: num(r[5]) === 1,
  };
}
