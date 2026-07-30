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
