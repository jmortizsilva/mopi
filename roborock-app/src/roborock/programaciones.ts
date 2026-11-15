/**
 * programaciones — lee y describe las programaciones guardadas en el robot (`get_timer`).
 *
 * Formato visto en el a170 (PROTOCOLO_ROBOROCK.md §8.4b):
 *   [id, "on"|"off", [cron, ["start_clean", {params}]]]
 * con `cron` = "minuto hora díaDelMes mes díasDeLaSemana" y días de cron (0 = domingo).
 */
import { detectarModo, FAN_EQUILIBRADO, MODOS, opcionesModo, planCambioModo, type ModoLimpieza } from "./limpieza";

export interface Programacion {
  /** Marca de tiempo en ms, como cadena: así la devuelve el robot y así hay que mandarla. */
  id: string;
  activa: boolean;
  hora: number;
  minuto: number;
  /** Días de la semana de cron (0 = domingo), ordenados. Vacío = todos los días. */
  dias: number[];
  /** Día del mes y mes si es una programación de fecha concreta; null si se repite. */
  fecha: { dia: number; mes: number } | null;
  metodo: string;
  params: Record<string, unknown>;
}

/** Días de cron de lunes a domingo: el orden en que se leen en español. */
const SEMANA = [1, 2, 3, 4, 5, 6, 0];
const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "1,3-5" → [1,3,4,5]. "*" → [] (todos). Null si no se entiende. El 7 de cron también es domingo. */
export function parseDiasCron(campo: string): number[] | null {
  if (campo === "*") return [];
  const dias = new Set<number>();
  for (const parte of campo.split(",")) {
    const rango = parte.match(/^(\d)(?:-(\d))?$/);
    if (!rango) return null;
    const desde = Number(rango[1]);
    const hasta = rango[2] != null ? Number(rango[2]) : desde;
    if (desde > 7 || hasta > 7 || hasta < desde) return null;
    for (let d = desde; d <= hasta; d++) dias.add(d % 7);
  }
  return [...dias].sort((a, b) => a - b);
}

function entero(campo: string, max: number): number | null {
  if (!/^\d+$/.test(campo)) return null;
  const n = Number(campo);
  return n <= max ? n : null;
}

/** Una entrada de `get_timer`, o null si no tiene el formato conocido. */
export function parseProgramacion(entrada: unknown): Programacion | null {
  if (!Array.isArray(entrada) || entrada.length < 3) return null;
  const [id, estado, cuerpo] = entrada;
  if ((typeof id !== "string" && typeof id !== "number") || !Array.isArray(cuerpo)) return null;
  const [cron, accion] = cuerpo;
  if (typeof cron !== "string" || !Array.isArray(accion) || typeof accion[0] !== "string") return null;

  const campos = cron.trim().split(/\s+/);
  if (campos.length !== 5) return null;
  const minuto = entero(campos[0], 59);
  const hora = entero(campos[1], 23);
  const dias = parseDiasCron(campos[4]);
  if (minuto == null || hora == null || dias == null) return null;

  let fecha: Programacion["fecha"] = null;
  if (campos[2] !== "*" || campos[3] !== "*") {
    const dia = entero(campos[2], 31);
    const mes = entero(campos[3], 12);
    if (dia == null || mes == null || dia === 0 || mes === 0) return null;
    fecha = { dia, mes };
  }

  const params = accion[1] && typeof accion[1] === "object" && !Array.isArray(accion[1])
    ? (accion[1] as Record<string, unknown>)
    : {};
  return {
    id: String(id),
    activa: estado === "on",
    hora,
    minuto,
    // Los siete días es lo mismo que "*": se normaliza para describirlo igual.
    dias: dias.length === 7 ? [] : dias,
    fecha,
    metodo: accion[0],
    params,
  };
}

/** Respuesta completa de `get_timer`, ordenada por hora. Las entradas que no se entienden se omiten. */
export function parseProgramaciones(respuesta: unknown): Programacion[] {
  if (!Array.isArray(respuesta)) return [];
  return respuesta
    .map(parseProgramacion)
    .filter((p): p is Programacion => p != null)
    .sort((a, b) => a.hora * 60 + a.minuto - (b.hora * 60 + b.minuto));
}

function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Los días como se dicen: "todos los días", "de lunes a viernes", "martes y jueves"… */
export function describirDias(dias: number[]): string {
  if (dias.length === 0 || dias.length === 7) return "todos los días";
  const enOrden = SEMANA.filter((d) => dias.includes(d));
  if (enOrden.length === 2 && enOrden[0] === 6 && enOrden[1] === 0) return "fines de semana";

  // Tres o más días seguidos (en orden de lunes a domingo) se leen como un tramo.
  const posiciones = enOrden.map((d) => SEMANA.indexOf(d));
  const seguidos = posiciones.every((p, i) => i === 0 || p === posiciones[i - 1] + 1);
  if (seguidos && enOrden.length >= 3) {
    return `de ${NOMBRES_DIA[enOrden[0]]} a ${NOMBRES_DIA[enOrden[enOrden.length - 1]]}`;
  }
  return enumerar(enOrden.map((d) => NOMBRES_DIA[d]));
}

export function horaLegible(hora: number, minuto: number): string {
  return `${hora}:${String(minuto).padStart(2, "0")}`;
}

/** Cuándo: "de martes a viernes a las 10:00", "el 15 de noviembre a las 9:30". Para los anuncios. */
export function describirCuando(p: Programacion): string {
  const hora = `a las ${horaLegible(p.hora, p.minuto)}`;
  if (p.fecha) return `el ${p.fecha.dia} de ${MESES[p.fecha.mes - 1]} ${hora}`;
  return `${describirDias(p.dias)} ${hora}`;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Qué se limpia. `segments: "0"` (o sin campo) es toda la casa; el formato con habitaciones no se
 * ha visto todavía, así que de momento no se nombran.
 */
function describirZona(params: Record<string, unknown>): string {
  const seg = params.segments;
  if (seg == null || seg === "0" || seg === 0 || seg === "") return "toda la casa";
  return "algunas habitaciones";
}

/** Texto completo de la lista: "10:00, de martes a viernes, toda la casa, solo aspirar. Desactivada." */
export function describirProgramacion(p: Programacion): string {
  const cuando = p.fecha ? `el ${p.fecha.dia} de ${MESES[p.fecha.mes - 1]}` : describirDias(p.dias);
  const partes = [horaLegible(p.hora, p.minuto), cuando];
  if (p.metodo === "start_clean") {
    partes.push(describirZona(p.params));
    const modo = detectarModo(numero(p.params.fan_power), numero(p.params.water_box_mode));
    partes.push((MODOS.find((m) => m.modo === modo)?.label ?? "").toLowerCase());
  } else {
    partes.push(`orden ${p.metodo}`);
  }
  return `${partes.filter(Boolean).join(", ")}. ${p.activa ? "Activada" : "Desactivada"}.`;
}

/** Anuncio tras activar o desactivar: primero el resultado, luego cuál. "Activada, de martes a viernes a las 10:00". */
export function anuncioActivacion(p: Programacion, activa: boolean): string {
  return `${activa ? "Activada" : "Desactivada"}, ${describirCuando(p)}`;
}

/** Anuncio si el robot no lo guarda. "No se pudo activar, de martes a viernes a las 10:00". */
export function anuncioFalloActivacion(p: Programacion, activa: boolean): string {
  return `No se pudo ${activa ? "activar" : "desactivar"}, ${describirCuando(p)}`;
}

/**
 * Texto de la acción de activar, que sirve a la vez de `name` de la acción del rotor: en iOS con la
 * arquitectura nueva el rotor lee el `name` e ignora el `label`, así que tiene que cambiar con el estado.
 */
export function etiquetaActivar(p: Programacion): "Activar" | "Desactivar" {
  return p.activa ? "Desactivar" : "Activar";
}

// ---------------------------------------------------------------------------
// Crear y editar
// ---------------------------------------------------------------------------

/** Lo que se elige en la pantalla de crear o editar. */
export interface BorradorProgramacion {
  hora: number;
  minuto: number;
  /** Días de cron (0 = domingo). Los siete = todos los días. */
  dias: number[];
  fanPower: number;
  waterBox: number;
  mopMode: number;
}

const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Params de `start_clean` que no se eligen en pantalla, copiados de las programaciones que crea la
 * app oficial en el a170. `segments: "0"` = toda la casa.
 */
const PARAMS_BASE: Record<string, unknown> = {
  segments: "0",
  repeat: 1,
  clean_order_mode: 0,
  map_index: -1,
  seq_type: 0,
};

/** Valores al crear una nueva: a las 10:00, todos los días, solo aspirar en Equilibrado. */
export function borradorNuevo(): BorradorProgramacion {
  return { hora: 10, minuto: 0, dias: [...TODOS_LOS_DIAS], fanPower: FAN_EQUILIBRADO, waterBox: 200, mopMode: 300 };
}

function numeroO(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

export function borradorDe(p: Programacion): BorradorProgramacion {
  const def = borradorNuevo();
  return {
    hora: p.hora,
    minuto: p.minuto,
    // Una de fecha concreta pasa a repetirse: la pantalla solo sabe de días de la semana.
    dias: p.dias.length === 0 ? [...TODOS_LOS_DIAS] : [...p.dias],
    fanPower: numeroO(p.params.fan_power, def.fanPower),
    waterBox: numeroO(p.params.water_box_mode, def.waterBox),
    mopMode: numeroO(p.params.mop_mode, def.mopMode),
  };
}

/**
 * Cambia el modo de limpieza ajustando lo que deja de valer: misma regla que en Inicio
 * (`planCambioModo`), y además la succión y la ruta se llevan a una que el modo ofrezca.
 */
export function borradorConModo(b: BorradorProgramacion, modo: ModoLimpieza): BorradorProgramacion {
  const plan = planCambioModo(modo, b.waterBox, b.fanPower);
  const r = { ...b, waterBox: plan.waterBox ?? b.waterBox, fanPower: plan.fanPower ?? b.fanPower };
  const opc = opcionesModo(modo);
  if (opc.fanCodes.length && !opc.fanCodes.includes(r.fanPower)) r.fanPower = FAN_EQUILIBRADO;
  if (opc.rutaCodes.length && !opc.rutaCodes.includes(r.mopMode)) r.mopMode = 300;
  return r;
}

/** Texto del error que impide guardar, o null si se puede. */
export function validarBorrador(b: BorradorProgramacion): string | null {
  if (b.dias.length === 0) return "Elige al menos un día.";
  return null;
}

export function cronDe(b: BorradorProgramacion): string {
  const dias = [...new Set(b.dias)].sort((x, y) => x - y);
  const campoDias = dias.length === 7 ? "*" : dias.join(",");
  return `${b.minuto} ${b.hora} * * ${campoDias}`;
}

/** Params de `start_clean`. Al editar se parte de los originales para no perder lo que no se elige aquí. */
export function paramsDe(b: BorradorProgramacion, base: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...PARAMS_BASE, ...base, fan_power: b.fanPower, water_box_mode: b.waterBox, mop_mode: b.mopMode };
}

/**
 * Params de `set_timer`: `[[id, [cron, ["start_clean", params]]]]`. Formato de python-miio, sin
 * el "on"/"off" que sí trae `get_timer`. Sin comprobar todavía en el a170.
 */
export function paramsSetTimer(id: string, b: BorradorProgramacion, base?: Record<string, unknown>): unknown[] {
  return [[id, [cronDe(b), ["start_clean", paramsDe(b, base)]]]];
}

/** Para los anuncios de lo que se va a guardar, con las mismas palabras que la lista. */
export function cuandoDeBorrador(b: BorradorProgramacion): string {
  const dias = b.dias.length === 7 ? [] : [...b.dias].sort((x, y) => x - y);
  return describirCuando({ id: "", activa: true, hora: b.hora, minuto: b.minuto, dias, fecha: null, metodo: "start_clean", params: {} });
}

export function anuncioGuardada(b: BorradorProgramacion): string {
  return `Guardada, ${cuandoDeBorrador(b)}`;
}

export function anuncioEliminada(p: Programacion): string {
  return `Eliminada, ${describirCuando(p)}`;
}

export function anuncioFalloEliminar(p: Programacion): string {
  return `No se pudo eliminar, ${describirCuando(p)}`;
}

/** Pregunta del diálogo de eliminar. */
export function preguntaEliminar(p: Programacion): string {
  return `¿Eliminar la programación de las ${horaLegible(p.hora, p.minuto)}?`;
}

/** Ids que aparecen en `despues` y no estaban en `antes`: así se encuentra la recién creada. */
export function idsNuevos(antes: Programacion[], despues: Programacion[]): string[] {
  const previos = new Set(antes.map((p) => p.id));
  return despues.filter((p) => !previos.has(p.id)).map((p) => p.id);
}
