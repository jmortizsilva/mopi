/**
 * statusDecoder — traduce la respuesta cruda de `get_status` a texto accesible en español.
 *
 * Es la capa que da valor a la app: convierte códigos numéricos (state, fan_power,
 * water_box_mode, mop_mode, error_code) en etiquetas legibles por un lector de pantalla.
 *
 * Las tablas cubren los valores habituales de los modelos Qrevo/S. Si aparece un código
 * no mapeado, se devuelve "Desconocido (código N)" en vez de fallar. Fáciles de afinar.
 */

// Estado general del robot (campo `state`)
export const STATE_LABELS: Record<number, string> = {
  1: "Iniciando",
  2: "Base desconectada",
  3: "Inactivo",
  4: "Control remoto activo",
  5: "Limpiando",
  6: "Volviendo a la base",
  7: "Modo manual",
  8: "Cargando",
  9: "Problema de carga",
  10: "En pausa",
  11: "Limpieza puntual",
  12: "Error",
  13: "Apagándose",
  14: "Actualizando",
  15: "Yendo a la base",
  16: "Yendo al punto objetivo",
  17: "Limpiando zona",
  18: "Limpiando habitación",
  22: "Vaciando el depósito",
  23: "Lavando la mopa",
  26: "Yendo a lavar la mopa",
  28: "En llamada",
  29: "Cartografiando",
  100: "Carga completa",
  101: "Dispositivo sin conexión",
};

// Potencia de succión (campo `fan_power`)
export const FAN_POWER_LABELS: Record<number, string> = {
  101: "Silencioso",
  102: "Equilibrado",
  103: "Turbo",
  104: "Máximo",
  105: "Suave", // (gentle/off, no es Máximo+)
  106: "Personalizado",
  108: "Máximo+",
  109: "Solo fregado", // cepillo levantado
  110: "Inteligente",
};

// Nivel de agua / fregado (campo `water_box_mode`)
export const WATER_BOX_LABELS: Record<number, string> = {
  200: "Apagado",
  201: "Bajo",
  202: "Medio",
  203: "Alto",
  204: "Personalizado",
  207: "Personalizado (inteligente)",
};

// Ruta / intensidad de fregado (campo `mop_mode`)
export const MOP_MODE_LABELS: Record<number, string> = {
  300: "Estándar",
  301: "Profundo",
  302: "Personalizado",
  303: "Profundo+",
  304: "Rápido",
};

// Códigos de error (campo `error_code`). 0 = sin error.
export const ERROR_LABELS: Record<number, string> = {
  0: "Sin errores",
  1: "Fallo del sensor láser",
  2: "Fallo del sensor de colisión",
  3: "Rueda en el aire",
  4: "Fallo del sensor anticaídas",
  5: "Cepillo principal atascado",
  6: "Cepillo lateral atascado",
  7: "Rueda bloqueada",
  8: "El robot está atascado",
  9: "Falta el depósito de polvo",
  10: "Filtro obstruido o mojado",
  11: "Campo magnético detectado",
  12: "Batería baja",
  13: "Problema de carga",
  14: "Fallo de la batería",
  15: "Sensor de pared sucio",
  16: "Superficie irregular",
  17: "Fallo del cepillo lateral",
  18: "Fallo del ventilador de succión",
  19: "Base sin alimentación",
  21: "Sensor de parachoques láser atascado",
  22: "Sensor de la base sucio",
  23: "Fallo en la base",
  24: "Detectada zona prohibida",
  254: "Depósito lleno",
  255: "Error interno",
};

function label(map: Record<number, string>, code: number): string {
  return map[code] ?? `Desconocido (código ${code})`;
}

export interface RawStatus {
  state?: number;
  battery?: number;
  error_code?: number;
  fan_power?: number;
  water_box_mode?: number;
  mop_mode?: number;
  in_cleaning?: number;
  in_returning?: number;
  charge_status?: number;
  map_present?: number;
  clean_time?: number;
  clean_area?: number;
  dry_status?: number;
  wash_status?: number;
  wash_phase?: number;
  dust_collection_status?: number;
  rdt?: number; // remaining dry time (segundos)
  water_shortage_status?: number;
  dock_error_status?: number;
  [key: string]: unknown;
}

/** Formatea segundos como "2 h 10 min", "45 min", etc. */
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export interface DecodedStatus {
  state: { code: number; label: string };
  battery: number;
  charging: boolean;
  cleaning: boolean;
  returning: boolean;
  hasError: boolean;
  error: { code: number; label: string };
  fanPower: { code: number; label: string };
  waterBox: { code: number; label: string };
  mopMode: { code: number; label: string };
  mapPresent: boolean;
  drying: boolean;
  washing: boolean;
  emptying: boolean;
  /** Tiempo restante de secado de mopa en segundos (0 si no está secando). */
  dryRemainingSec: number;
  /** Actividad del dock en texto (incluye tiempo restante de secado), o null si no hay. */
  dockActivity: string | null;
  /** Avisos de estado (falta de agua, error de base…). Vacío si todo va bien. */
  warnings: string[];
  cleanTimeSec: number;
  cleanAreaM2: number;
  raw: RawStatus;
}

/** Acepta el objeto de estado, o el array que devuelve get_status (`[ {...} ]`). */
export function decodeStatus(input: RawStatus | RawStatus[] | unknown): DecodedStatus {
  const raw = (Array.isArray(input) ? input[0] : input) as RawStatus;
  if (!raw || typeof raw !== "object") {
    throw new Error("get_status: respuesta vacía o con formato inesperado.");
  }

  const stateCode = raw.state ?? -1;
  const errorCode = raw.error_code ?? 0;
  const fanCode = raw.fan_power ?? -1;
  const waterCode = raw.water_box_mode ?? -1;
  const mopCode = raw.mop_mode ?? -1;

  const drying = raw.dry_status === 1;
  const washing = (raw.wash_phase ?? 0) > 0;
  const emptying = raw.dust_collection_status === 1;
  const dryRemainingSec = raw.rdt ?? 0;

  let dockActivity: string | null = null;
  if (drying) dockActivity = dryRemainingSec > 0 ? `Secando mopa, quedan ${formatDuration(dryRemainingSec)}` : "Secando mopa";
  else if (washing) dockActivity = "Lavando mopa";
  else if (emptying) dockActivity = "Vaciando depósito";

  const warnings: string[] = [];
  if (raw.water_shortage_status === 1) warnings.push("Falta agua en el depósito");
  if ((raw.dock_error_status ?? 0) !== 0) warnings.push("Error en la base");

  return {
    state: { code: stateCode, label: label(STATE_LABELS, stateCode) },
    battery: raw.battery ?? 0,
    charging: raw.charge_status === 1 || stateCode === 8 || stateCode === 100,
    cleaning: raw.in_cleaning === 1 || stateCode === 5 || stateCode === 17 || stateCode === 18,
    returning: raw.in_returning === 1 || stateCode === 6 || stateCode === 15,
    hasError: errorCode !== 0,
    error: { code: errorCode, label: label(ERROR_LABELS, errorCode) },
    fanPower: { code: fanCode, label: label(FAN_POWER_LABELS, fanCode) },
    waterBox: { code: waterCode, label: label(WATER_BOX_LABELS, waterCode) },
    mopMode: { code: mopCode, label: label(MOP_MODE_LABELS, mopCode) },
    mapPresent: raw.map_present === 1,
    drying,
    washing,
    emptying,
    dryRemainingSec,
    dockActivity,
    warnings,
    cleanTimeSec: raw.clean_time ?? 0,
    cleanAreaM2: Math.round(((raw.clean_area ?? 0) / 1_000_000) * 100) / 100, // mm² → m²
    raw,
  };
}

/** Qué controles principales tienen sentido según el estado actual del robot. Pura → testable. */
export interface ControlesEstado {
  empezar: boolean; // empezar o reanudar limpieza
  pausar: boolean;
  parar: boolean;
  dock: boolean; // volver a la base
}

/**
 * Decide qué controles habilitar. Con estado desconocido (null) es permisivo (todo habilitado)
 * para no dejar al usuario sin salida. Nunca deshabilita "parar" mientras hay algo en marcha.
 */
export function controlesSegunEstado(d: DecodedStatus | null): ControlesEstado {
  if (!d) return { empezar: true, pausar: true, parar: true, dock: true };
  const pausado = d.state.code === 10;
  const enMarcha = (d.cleaning || d.returning) && !pausado;
  return {
    empezar: pausado || (!d.cleaning && !d.returning), // reanudar, o empezar si está parado
    pausar: enMarcha,
    parar: enMarcha || pausado,
    dock: !d.charging && !d.returning, // ir a la base si no está ya cargando ni volviendo
  };
}

/** Frase corta y clara, pensada para leerse con lector de pantalla. */
/**
 * Resumen accesible del ESTADO (no de la configuración). Incluye estado general, batería,
 * actividad de la base (secado/lavado/vaciado) y errores. La succión/agua/fregado son
 * ajustes y van en la pantalla de Configuración, no aquí.
 */
export function summarizeStatus(d: DecodedStatus): string {
  const partes: string[] = [d.state.label, `Batería ${d.battery} por ciento`];
  if (d.dockActivity) partes.push(d.dockActivity);
  for (const w of d.warnings) partes.push(w);
  if (d.hasError) partes.push(`Error: ${d.error.label}`);
  return partes.join(". ") + ".";
}
