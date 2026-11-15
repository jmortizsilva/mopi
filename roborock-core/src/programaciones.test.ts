import { describe, expect, it } from "vitest";
import {
  anuncioActivacion,
  anuncioEliminada,
  anuncioGuardada,
  borradorConModo,
  borradorDe,
  borradorNuevo,
  cronDe,
  idsNuevos,
  paramsSetTimer,
  preguntaEliminar,
  validarBorrador,
  anuncioFalloActivacion,
  describirCuando,
  etiquetaActivar,
  describirDias,
  describirProgramacion,
  parseDiasCron,
  parseProgramacion,
  parseProgramaciones,
} from "./programaciones";

// Respuesta real de get_timer en el a170 (sondeo del 2026-11-15).
const REAL = [
  ["1786028936998", "off", ["0 10 * * 2,3,4,5", ["start_clean", { fan_power: 108, segments: "0", repeat: 1, clean_order_mode: 0, water_box_mode: 200, map_index: -1, mop_mode: 300, seq_type: 0 }]]],
  ["1786394496143", "off", ["0 12 * * 3,5", ["start_clean", { fan_power: 105, segments: "0", repeat: 1, clean_order_mode: 0, water_box_mode: 202, map_index: -1, mop_mode: 301, seq_type: 0 }]]],
];

describe("parseProgramaciones", () => {
  it("lee la respuesta real del a170", () => {
    const [a, b] = parseProgramaciones(REAL);
    expect(a).toMatchObject({ id: "1786028936998", activa: false, hora: 10, minuto: 0, dias: [2, 3, 4, 5], fecha: null, metodo: "start_clean" });
    expect(a.params.fan_power).toBe(108);
    expect(b).toMatchObject({ hora: 12, dias: [3, 5] });
  });

  it("ordena por hora", () => {
    const tarde = ["2", "on", ["30 18 * * *", ["start_clean", {}]]];
    const pronto = ["1", "on", ["15 7 * * *", ["start_clean", {}]]];
    expect(parseProgramaciones([tarde, pronto]).map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("omite lo que no entiende sin romper el resto", () => {
    const r = parseProgramaciones([["x"], ["1", "on", ["mal", ["start_clean", {}]]], REAL[0], null]);
    expect(r).toHaveLength(1);
  });

  it("devuelve [] si la respuesta no es una lista", () => {
    expect(parseProgramaciones({ error: "x" })).toEqual([]);
  });

  it("acepta id numérico pero lo guarda como cadena", () => {
    expect(parseProgramacion([123, "on", ["0 9 * * *", ["start_clean", {}]]])?.id).toBe("123");
  });

  it("los siete días equivalen a todos los días", () => {
    expect(parseProgramacion(["1", "on", ["0 9 * * 0,1,2,3,4,5,6", ["start_clean", {}]]])?.dias).toEqual([]);
  });

  it("fecha concreta", () => {
    expect(parseProgramacion(["1", "on", ["30 9 15 11 *", ["start_clean", {}]]])?.fecha).toEqual({ dia: 15, mes: 11 });
  });
});

describe("parseDiasCron", () => {
  it("lista, rangos, asterisco y el 7 como domingo", () => {
    expect(parseDiasCron("2,3,4,5")).toEqual([2, 3, 4, 5]);
    expect(parseDiasCron("1-5")).toEqual([1, 2, 3, 4, 5]);
    expect(parseDiasCron("*")).toEqual([]);
    expect(parseDiasCron("6,7")).toEqual([0, 6]);
    expect(parseDiasCron("lun")).toBeNull();
  });
});

describe("describirDias", () => {
  it.each([
    [[], "todos los días"],
    [[0, 1, 2, 3, 4, 5, 6], "todos los días"],
    [[1, 2, 3, 4, 5], "de lunes a viernes"],
    [[2, 3, 4, 5], "de martes a viernes"],
    [[0, 6], "fines de semana"],
    [[3, 5], "miércoles y viernes"],
    [[1, 3, 5], "lunes, miércoles y viernes"],
    [[2], "martes"],
    // El domingo va al final aunque en cron sea el 0.
    [[0, 1], "lunes y domingo"],
    [[5, 6, 0], "de viernes a domingo"],
    [[1, 2], "lunes y martes"],
  ])("%j → %s", (dias, texto) => {
    expect(describirDias(dias)).toBe(texto);
  });
});

describe("describirProgramacion", () => {
  it("textos de la lista con los datos reales", () => {
    const [a, b] = parseProgramaciones(REAL);
    expect(describirProgramacion(a)).toBe("10:00, de martes a viernes, toda la casa, solo aspirar. Desactivada.");
    expect(describirProgramacion(b)).toBe("12:00, miércoles y viernes, toda la casa, solo fregar. Desactivada.");
  });

  it("activa, con minutos y aspirar y fregar", () => {
    const p = parseProgramacion(["1", "on", ["5 9 * * *", ["start_clean", { fan_power: 102, water_box_mode: 202, segments: "0" }]]])!;
    expect(describirProgramacion(p)).toBe("9:05, todos los días, toda la casa, aspirar y fregar. Activada.");
  });

  it("habitaciones concretas sin nombrar todavía", () => {
    const p = parseProgramacion(["1", "on", ["0 9 * * *", ["start_clean", { segments: "6,7", water_box_mode: 200 }]]])!;
    expect(describirProgramacion(p)).toContain("algunas habitaciones");
  });

  it("cuándo, para los anuncios", () => {
    const [a] = parseProgramaciones(REAL);
    expect(describirCuando(a)).toBe("de martes a viernes a las 10:00");
    const f = parseProgramacion(["1", "on", ["30 9 15 11 *", ["start_clean", {}]]])!;
    expect(describirCuando(f)).toBe("el 15 de noviembre a las 9:30");
  });
});

describe("anuncios de activar y desactivar", () => {
  it("primero el resultado y después cuál", () => {
    const [a] = parseProgramaciones(REAL);
    expect(anuncioActivacion(a, true)).toBe("Activada, de martes a viernes a las 10:00");
    expect(anuncioActivacion(a, false)).toBe("Desactivada, de martes a viernes a las 10:00");
    expect(anuncioFalloActivacion(a, true)).toBe("No se pudo activar, de martes a viernes a las 10:00");
  });
});

describe("etiquetaActivar", () => {
  // Fallo visto en el móvil: el rotor seguía diciendo "activar" en las ya activadas.
  it("cambia con el estado, porque el rotor solo lee este texto", () => {
    const [a] = parseProgramaciones(REAL);
    expect(etiquetaActivar(a)).toBe("Activar");
    expect(etiquetaActivar({ ...a, activa: true })).toBe("Desactivar");
  });
});

describe("crear y editar", () => {
  it("cron: días ordenados y los siete como asterisco", () => {
    expect(cronDe({ ...borradorNuevo(), hora: 10, minuto: 5, dias: [5, 2, 3, 4] })).toBe("5 10 * * 2,3,4,5");
    expect(cronDe(borradorNuevo())).toBe("0 10 * * *");
  });

  it("ida y vuelta: lo que se guarda se lee igual", () => {
    const b = { ...borradorNuevo(), hora: 7, minuto: 30, dias: [1, 3, 5] };
    const [[id, cuerpo]] = paramsSetTimer("123", b) as [[string, unknown[]]];
    const leida = parseProgramacion([id, "on", cuerpo])!;
    expect(borradorDe(leida)).toEqual(b);
  });

  it("al editar conserva los params que no se eligen (habitaciones)", () => {
    const [a] = parseProgramaciones(REAL);
    const base = { ...a.params, segments: "6,7" };
    const [[, [, [, params]]]] = paramsSetTimer("1", borradorDe({ ...a, params: base }), base) as [[string, [string, [string, Record<string, unknown>]]]];
    expect(params.segments).toBe("6,7");
    expect(params.map_index).toBe(-1);
  });

  it("borrador de la programación real", () => {
    const [a] = parseProgramaciones(REAL);
    expect(borradorDe(a)).toEqual({ hora: 10, minuto: 0, dias: [2, 3, 4, 5], fanPower: 108, waterBox: 200, mopMode: 300 });
  });

  it("cambiar de modo deja valores que el modo admite", () => {
    const aspirar = { ...borradorNuevo(), fanPower: 108 };
    const fregando = borradorConModo(aspirar, "aspirar_fregar");
    expect(fregando.waterBox).toBe(202);
    expect(fregando.fanPower).toBe(104); // Máximo+ no se mantiene fregando
    const soloFregar = borradorConModo({ ...fregando, mopMode: 301 }, "fregar");
    expect(soloFregar.fanPower).toBe(105);
    expect(soloFregar.mopMode).toBe(301);
    const otraVez = borradorConModo(soloFregar, "aspirar_fregar");
    expect(otraVez.mopMode).toBe(300); // la ruta profunda no se ofrece al aspirar y fregar
    expect(borradorConModo(otraVez, "aspirar").waterBox).toBe(200);
  });

  it("sin días no se puede guardar", () => {
    expect(validarBorrador({ ...borradorNuevo(), dias: [] })).toBe("Elige al menos un día.");
    expect(validarBorrador(borradorNuevo())).toBeNull();
  });

  it("anuncios y pregunta de eliminar", () => {
    const [a] = parseProgramaciones(REAL);
    expect(anuncioGuardada(borradorDe(a))).toBe("Guardada, de martes a viernes a las 10:00");
    expect(anuncioGuardada(borradorNuevo())).toBe("Guardada, todos los días a las 10:00");
    expect(anuncioEliminada(a)).toBe("Eliminada, de martes a viernes a las 10:00");
    expect(preguntaEliminar(a)).toBe("¿Eliminar la programación de las 10:00?");
  });

  it("encuentra la recién creada aunque el robot le cambie el id", () => {
    const antes = parseProgramaciones(REAL);
    const nueva = parseProgramacion(["999", "on", ["0 8 * * *", ["start_clean", {}]]])!;
    expect(idsNuevos(antes, [...antes, nueva])).toEqual(["999"]);
  });
});
