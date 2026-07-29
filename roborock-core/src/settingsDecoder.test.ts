import { describe, expect, it } from "vitest";
import { decodeConsumables, firstNumber } from "./settingsDecoder";

// Consumibles reales del Qrevo S5V.
const REAL = [
  {
    main_brush_work_time: 4785,
    side_brush_work_time: 5036,
    filter_work_time: 4785,
    sensor_dirty_time: 5036,
  },
];

describe("decodeConsumables", () => {
  it("calcula el % de vida restante con las respuestas reales", () => {
    const c = decodeConsumables(REAL);
    const byKey = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(byKey["main_brush_work_time"].percentLeft).toBe(100); // 4785s de 300h ≈ 100%
    expect(byKey["sensor_dirty_time"].percentLeft).toBe(95); // 5036s de 30h ≈ 95%
    expect(byKey["main_brush_work_time"].name).toBe("Cepillo principal");
  });

  it("acepta objeto o array y tolera datos ausentes", () => {
    expect(decodeConsumables({})).toEqual([]);
    expect(decodeConsumables(null)).toEqual([]);
    expect(decodeConsumables(REAL[0]).length).toBe(4);
  });
});

describe("firstNumber", () => {
  it("extrae el número de [100] o 100", () => {
    expect(firstNumber([100])).toBe(100);
    expect(firstNumber(75)).toBe(75);
    expect(firstNumber({})).toBeNull();
  });
});
