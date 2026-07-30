import { describe, expect, it } from "vitest";
import { succionCompatibleConFregado, estadoLimpieza, esRutaProfunda, FAN_MAX, FAN_EQUILIBRADO } from "./limpieza";

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
