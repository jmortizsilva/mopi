import { describe, expect, it } from "vitest";
import { succionCompatibleConFregado, FAN_MAX, FAN_EQUILIBRADO } from "./limpieza";

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
