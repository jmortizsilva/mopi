import { describe, expect, it } from "vitest";
import { decodeCleanSummary, decodeCleanRecord } from "./cleanHistory";

describe("decodeCleanSummary", () => {
  it("formato array [tiempo, area, cuenta, [ids]]", () => {
    const r = decodeCleanSummary([123456, 5_000_000, 7, [1785773511, 1785700000]]);
    expect(r.totalDuracionSeg).toBe(123456);
    expect(r.totalAreaM2).toBe(5); // 5.000.000 mm² → 5 m²
    expect(r.totalLimpiezas).toBe(7);
    expect(r.ids).toEqual([1785773511, 1785700000]);
  });

  it("formato objeto {clean_time, clean_area, clean_count, records}", () => {
    const r = decodeCleanSummary({ clean_time: 100, clean_area: 2_500_000, clean_count: 3, records: [1, 2, 3] });
    expect(r.totalDuracionSeg).toBe(100);
    expect(r.totalAreaM2).toBe(2.5);
    expect(r.totalLimpiezas).toBe(3);
    expect(r.ids).toEqual([1, 2, 3]);
  });

  it("desenvuelve [ {...} ] y tolera basura", () => {
    expect(decodeCleanSummary([{ clean_time: 10, records: [9] }]).ids).toEqual([9]);
    expect(decodeCleanSummary(null)).toEqual({ totalDuracionSeg: 0, totalAreaM2: 0, totalLimpiezas: 0, ids: [] });
  });
});

describe("decodeCleanRecord", () => {
  it("registro envuelto [[inicio, fin, duracion, area, error, completada]]", () => {
    const r = decodeCleanRecord([[1785773511, 1785775000, 1489, 4_427_500, 0, 1]]);
    expect(r).toEqual({
      inicio: 1785773511,
      fin: 1785775000,
      duracionSeg: 1489,
      areaM2: 4.43,
      error: 0,
      completada: true,
    });
  });

  it("registro sin envolver y completada=0", () => {
    const r = decodeCleanRecord([100, 200, 100, 1_000_000, 5, 0]);
    expect(r?.completada).toBe(false);
    expect(r?.error).toBe(5);
  });

  it("devuelve null si no hay datos suficientes", () => {
    expect(decodeCleanRecord([1, 2])).toBeNull();
    expect(decodeCleanRecord(null)).toBeNull();
    expect(decodeCleanRecord([])).toBeNull();
  });

  // Fallo visto en el móvil: los totales salían pero "Últimas limpiezas" quedaba vacío, porque
  // solo se entendía el formato de lista de números y el resto se descartaba sin avisar.
  it("registro como objeto, envuelto o no", () => {
    const o = { begin: 100, end: 400, duration: 300, area: 2_000_000, error: 0, complete: 1, start_type: 2 };
    const esperado = { inicio: 100, fin: 400, duracionSeg: 300, areaM2: 2, error: 0, completada: true };
    expect(decodeCleanRecord(o)).toEqual(esperado);
    expect(decodeCleanRecord([o])).toEqual(esperado);
  });

  it("varios tramos de una limpieza se juntan como en python-roborock", () => {
    const r = decodeCleanRecord([
      { begin: 100, end: 200, duration: 100, area: 1_000_000, error: 0, complete: 0 },
      { begin: 300, end: 500, duration: 200, area: 1_500_000, error: 0, complete: 1 },
    ]);
    expect(r).toEqual({ inicio: 100, fin: 500, duracionSeg: 300, areaM2: 2.5, error: 0, completada: true });
  });

  it("lista de números con campos de otro tipo al final", () => {
    expect(decodeCleanRecord([100, 200, 100, 1_000_000, 0, 1, "x"])?.duracionSeg).toBe(100);
  });
});
