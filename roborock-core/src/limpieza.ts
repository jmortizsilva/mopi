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
