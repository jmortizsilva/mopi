/**
 * registro — graba una sesión de pruebas (comandos + respuestas del robot) para compartirla.
 *
 * Estado a nivel de módulo (singleton): la grabación sigue aunque se cambie de pantalla. Se
 * alimenta desde `RoborockClient.onActivity`. `finalizarPrueba()` devuelve un texto legible listo
 * para la hoja de compartir de iOS.
 */
import { Platform } from "react-native";
import type { ActividadComando } from "../roborock";

interface Entrada extends ActividadComando {
  t: number;
}

let grabando = false;
let inicio = 0;
let entradas: Entrada[] = [];
let meta: Record<string, string> = {};

export function estaGrabando(): boolean {
  return grabando;
}

export function contarEntradas(): number {
  return entradas.length;
}

/** Empieza una grabación nueva (descarta la anterior). `datos` = cabecera (modelo, versión…). */
export function iniciarPrueba(datos: Record<string, string> = {}): void {
  grabando = true;
  inicio = Date.now();
  entradas = [];
  meta = datos;
}

/** Registra una actividad del cliente. No hace nada si no se está grabando. */
export function registrarActividad(a: ActividadComando): void {
  if (!grabando) return;
  entradas.push({ t: Date.now(), ...a });
}

/** Añade una nota de texto libre a la grabación (p. ej. "empiezo prueba 1"). */
export function registrarNota(texto: string): void {
  if (!grabando) return;
  entradas.push({ t: Date.now(), dir: "out", method: `NOTA: ${texto}`, messageID: -1 });
}

/** De una respuesta de estado, saca los campos clave para leer el log de un vistazo. */
function campos(result: unknown): string {
  const r = Array.isArray(result) ? result[0] : result;
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    if ("fan_power" in o || "water_box_mode" in o || "mop_mode" in o) {
      return ` state=${o.state} fan=${o.fan_power} water=${o.water_box_mode} mop=${o.mop_mode}`;
    }
  }
  return "";
}

/** Cierra la grabación y devuelve el texto para compartir. */
export function finalizarPrueba(): string {
  grabando = false;
  const l: string[] = [];
  l.push("=== Registro de pruebas Mopi ===");
  l.push(`Inicio: ${new Date(inicio).toISOString()}`);
  for (const [k, v] of Object.entries(meta)) l.push(`${k}: ${v}`);
  l.push(`Plataforma: ${Platform.OS}`);
  l.push(`Eventos: ${entradas.length}`);
  l.push("");
  for (const e of entradas) {
    const dt = ((e.t - inicio) / 1000).toFixed(1);
    if (e.dir === "out") {
      const p = e.method.startsWith("NOTA:") ? "" : ` ${JSON.stringify(e.params ?? [])}`;
      l.push(`[+${dt}s] -> ${e.method}${p}`);
    } else if (e.error) {
      l.push(`[+${dt}s] <- ${e.method} ERROR ${e.error}`);
    } else {
      l.push(`[+${dt}s] <- ${e.method}${campos(e.result)}  ${JSON.stringify(e.result)}`);
    }
  }
  l.push("");
  l.push(`=== Fin: ${new Date().toISOString()} ===`);
  return l.join("\n");
}
