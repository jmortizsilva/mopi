/**
 * limpieza — reglas puras de compatibilidad entre succión y fregado.
 *
 * Máximo+ (108) SOLO funciona aspirando sin mopa: en cuanto se friega, el tope real es Máximo
 * (104). Documentado para el Q Revo (el robot acepta Máximo+ mientras friega pero no lo
 * mantiene; combinar ambos deja un estado incoherente). Además 105 (suave/off) y 109 (solo
 * fregar) no son succiones válidas para "aspirar y fregar".
 */

export const FAN_MAX_PLUS = 108; // "Máximo+"
export const FAN_MAX = 104; // "Máximo"
export const FAN_EQUILIBRADO = 102;

/** Códigos de succión que no pueden convivir con el fregado. */
const INCOMPATIBLES_CON_FREGADO = new Set([FAN_MAX_PLUS, 105, 109]);

/**
 * Devuelve una succión válida al entrar en modo aspirar+fregar, o `null` si la actual ya vale.
 * Máximo+ baja a Máximo (conserva la intención de "mucha succión"); el resto de incompatibles
 * pasan a Equilibrado.
 */
export function succionCompatibleConFregado(fan: number | null): number | null {
  if (fan == null || !INCOMPATIBLES_CON_FREGADO.has(fan)) return null;
  return fan === FAN_MAX_PLUS ? FAN_MAX : FAN_EQUILIBRADO;
}

// --- Reglas de qué controles ofrecer según el modo de limpieza actual ---

const AGUA_APAGADA = 200; // water_box_mode = solo aspira

/**
 * Rutas de fregado "profundas". Según Roborock, en ruta profunda la succión se MINIMIZA y no es
 * ajustable (solo la intensidad de fregado sigue eligiéndose). 301 = Profundo, 303 = Profundo+.
 * (Los valores exactos de succión del a170 se confirman en runtime con la verificación en caliente.)
 */
export function esRutaProfunda(mopMode: number | null): boolean {
  return mopMode === 301 || mopMode === 303;
}

export interface EstadoLimpieza {
  /** Hay mopa puesta (agua != apagada): aplican los ajustes de fregado. */
  fregando: boolean;
  /** Ruta de fregado profunda (el robot reduce la succión). */
  rutaProfunda: boolean;
  /** Mostrar controles de fregado (nivel de agua, ruta): solo si se está fregando. */
  mostrarControlesFregado: boolean;
  /** La succión la fija el robot (ruta profunda mientras friega): informar, no dejar elegir a lo loco. */
  succionMinimizadaPorRobot: boolean;
}

/** Decide qué ofrecer en la sección de Limpieza a partir del estado actual. Pura → testable. */
export function estadoLimpieza(waterBoxMode: number | null, mopMode: number | null): EstadoLimpieza {
  const fregando = waterBoxMode != null && waterBoxMode !== AGUA_APAGADA;
  const rutaProfunda = esRutaProfunda(mopMode);
  return {
    fregando,
    rutaProfunda,
    mostrarControlesFregado: fregando,
    succionMinimizadaPorRobot: fregando && rutaProfunda,
  };
}

// --- Modelo de los 3 modos de limpieza del a170 (deducido de logs reales del robot) ---
//
// El modo se codifica con dos campos, que están acoplados en el robot:
//  - water_box_mode = 200  → SOLO ASPIRAR (mopa apagada); succión libre, incluido Máximo+ (108).
//  - water_box_mode >= 201 + fan_power = 105 (Suave = succión mínima) → SOLO FREGAR; admite todas
//    las rutas, incluidas profunda/profunda+.
//  - water_box_mode >= 201 + fan_power real (101-104) → ASPIRAR Y FREGAR; rutas estándar/rápido.
// Acoplamiento observado: poner ruta profunda fuerza fan a 105; poner succión real resetea la
// ruta a estándar. Por eso profunda/profunda+ solo tienen sentido en "solo fregar".

export type ModoLimpieza = "aspirar" | "aspirar_fregar" | "fregar";

export const FAN_MINIMA = 105; // "Suave": succión mínima = modo solo fregar

export const MODOS: { modo: ModoLimpieza; label: string }[] = [
  { modo: "aspirar", label: "Solo aspirar" },
  { modo: "aspirar_fregar", label: "Aspirar y fregar" },
  { modo: "fregar", label: "Solo fregar" },
];

/** Modo actual según succión y agua. */
export function detectarModo(fan: number | null, water: number | null): ModoLimpieza {
  if (water == null || water === AGUA_APAGADA) return "aspirar";
  return fan === FAN_MINIMA ? "fregar" : "aspirar_fregar";
}

// Succiones y rutas que ofrece cada modo (códigos del robot).
const FAN_ASPIRAR = [101, 102, 103, 104, 108]; // incluye Máximo+
const FAN_ASPIRAR_FREGAR = [101, 102, 103, 104]; // sin Máximo+ (no lo mantiene con mopa)
const RUTA_ASPIRAR_FREGAR = [300, 304]; // estándar, rápido
const RUTA_FREGAR = [300, 304, 301, 303]; // estándar, rápido, profunda, profunda+

export interface OpcionesModo {
  mostrarSuccion: boolean;
  mostrarAgua: boolean;
  mostrarRuta: boolean;
  /** En "solo fregar" la succión la fija el robot (mínima): no se elige. */
  succionFija: boolean;
  fanCodes: number[];
  rutaCodes: number[];
}

export function opcionesModo(modo: ModoLimpieza): OpcionesModo {
  switch (modo) {
    case "aspirar":
      return { mostrarSuccion: true, mostrarAgua: false, mostrarRuta: false, succionFija: false, fanCodes: FAN_ASPIRAR, rutaCodes: [] };
    case "aspirar_fregar":
      return { mostrarSuccion: true, mostrarAgua: true, mostrarRuta: true, succionFija: false, fanCodes: FAN_ASPIRAR_FREGAR, rutaCodes: RUTA_ASPIRAR_FREGAR };
    case "fregar":
      return { mostrarSuccion: false, mostrarAgua: true, mostrarRuta: true, succionFija: true, fanCodes: [], rutaCodes: RUTA_FREGAR };
  }
}

export interface PlanCambioModo {
  waterBox?: number;
  fanPower?: number;
}

/** Comandos para entrar en un modo, dado el estado actual (agua/succión). Pura → testable. */
export function planCambioModo(modo: ModoLimpieza, currentWater: number | null, currentFan: number | null): PlanCambioModo {
  if (modo === "aspirar") {
    const plan: PlanCambioModo = { waterBox: AGUA_APAGADA };
    if (currentFan === FAN_MINIMA) plan.fanPower = FAN_EQUILIBRADO; // 105 no es succión de aspirado
    return plan;
  }
  const water = currentWater != null && currentWater > AGUA_APAGADA ? currentWater : 202;
  if (modo === "fregar") {
    return { waterBox: water, fanPower: FAN_MINIMA }; // succión mínima = solo fregar
  }
  // aspirar_fregar: la succión debe ser real (105/108/109 no valen)
  const fix = succionCompatibleConFregado(currentFan);
  return fix != null ? { waterBox: water, fanPower: fix } : { waterBox: water };
}
