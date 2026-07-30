import { describe, expect, it } from "vitest";
import {
  succionCompatibleConFregado,
  estadoLimpieza,
  esRutaProfunda,
  detectarModo,
  opcionesModo,
  planCambioModo,
  FAN_MAX,
  FAN_EQUILIBRADO,
  FAN_MINIMA,
} from "./limpieza";

describe("succionCompatibleConFregado", () => {
  it("Máximo+ (108) baja a Máximo (104) al fregar", () => {
    expect(succionCompatibleConFregado(108)).toBe(FAN_MAX);
  });

  it("Suave (105) y solo-fregar (109) pasan a Equilibrado", () => {
    expect(succionCompatibleConFregado(105)).toBe(FAN_EQUILIBRADO);
    expect(succionCompatibleConFregado(109)).toBe(FAN_EQUILIBRADO);
  });

  it("las succiones válidas con fregado no se tocan (null)", () => {
    for (const fan of [101, 102, 103, 104, 106, 110]) {
      expect(succionCompatibleConFregado(fan)).toBeNull();
    }
  });

  it("null (desconocida) no se toca", () => {
    expect(succionCompatibleConFregado(null)).toBeNull();
  });
});

describe("esRutaProfunda", () => {
  it("301 y 303 son profundas; 300/304 no", () => {
    expect(esRutaProfunda(301)).toBe(true);
    expect(esRutaProfunda(303)).toBe(true);
    expect(esRutaProfunda(300)).toBe(false);
    expect(esRutaProfunda(304)).toBe(false);
    expect(esRutaProfunda(null)).toBe(false);
  });
});

describe("estadoLimpieza", () => {
  it("solo aspirar (agua 200): no friega, no muestra controles de fregado", () => {
    const e = estadoLimpieza(200, 300);
    expect(e.fregando).toBe(false);
    expect(e.mostrarControlesFregado).toBe(false);
    expect(e.succionMinimizadaPorRobot).toBe(false);
  });

  it("aspirar y fregar en ruta estándar: friega, succión libre", () => {
    const e = estadoLimpieza(202, 300);
    expect(e.fregando).toBe(true);
    expect(e.mostrarControlesFregado).toBe(true);
    expect(e.succionMinimizadaPorRobot).toBe(false);
  });

  it("aspirar y fregar en ruta profunda: el robot minimiza la succión", () => {
    const e = estadoLimpieza(203, 303);
    expect(e.fregando).toBe(true);
    expect(e.rutaProfunda).toBe(true);
    expect(e.succionMinimizadaPorRobot).toBe(true);
  });

  it("agua desconocida (null): no asume que friega", () => {
    expect(estadoLimpieza(null, 300).fregando).toBe(false);
  });
});

describe("detectarModo", () => {
  it("agua apagada (200) = solo aspirar, sea cual sea la succión", () => {
    expect(detectarModo(104, 200)).toBe("aspirar");
    expect(detectarModo(108, 200)).toBe("aspirar");
  });
  it("agua + succión mínima (105) = solo fregar", () => {
    expect(detectarModo(FAN_MINIMA, 202)).toBe("fregar");
  });
  it("agua + succión real = aspirar y fregar", () => {
    expect(detectarModo(103, 202)).toBe("aspirar_fregar");
  });
});

describe("opcionesModo", () => {
  it("solo aspirar: succión con Máximo+, sin agua ni ruta", () => {
    const o = opcionesModo("aspirar");
    expect(o.fanCodes).toContain(108);
    expect(o.mostrarAgua).toBe(false);
    expect(o.mostrarRuta).toBe(false);
  });
  it("aspirar y fregar: succión sin Máximo+, rutas estándar/rápido", () => {
    const o = opcionesModo("aspirar_fregar");
    expect(o.fanCodes).not.toContain(108);
    expect(o.rutaCodes).toEqual([300, 304]);
    expect(o.succionFija).toBe(false);
  });
  it("solo fregar: succión fija, rutas incluyen profundas", () => {
    const o = opcionesModo("fregar");
    expect(o.succionFija).toBe(true);
    expect(o.mostrarSuccion).toBe(false);
    expect(o.rutaCodes).toEqual([300, 304, 301, 303]);
  });
});

describe("planCambioModo", () => {
  it("a solo aspirar: apaga el agua; si venía de succión mínima, la sube", () => {
    expect(planCambioModo("aspirar", 202, FAN_MINIMA)).toEqual({ waterBox: 200, fanPower: FAN_EQUILIBRADO });
    expect(planCambioModo("aspirar", 202, 103)).toEqual({ waterBox: 200 });
  });
  it("a solo fregar: enciende agua y pone succión mínima", () => {
    expect(planCambioModo("fregar", 200, 104)).toEqual({ waterBox: 202, fanPower: FAN_MINIMA });
  });
  it("a aspirar y fregar: agua on y succión real (Máximo+ baja a Máximo)", () => {
    expect(planCambioModo("aspirar_fregar", 200, 108)).toEqual({ waterBox: 202, fanPower: FAN_MAX });
    expect(planCambioModo("aspirar_fregar", 203, 103)).toEqual({ waterBox: 203 });
  });
});
