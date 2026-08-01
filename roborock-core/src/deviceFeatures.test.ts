import { describe, expect, it } from "vitest";
import { decodeFeatures, entradaFeatures } from "./deviceFeatures";

// Construye un string hex con ciertos bits activados (índice de bit estilo new_feature_str_bit,
// contando desde el final). Espejo de la decodificación, para test de ida y vuelta.
function conBits(bits: number[], longitudNibbles = 32): string {
  const nibbles = new Array(longitudNibbles).fill(0); // nibbles[0] = carácter más a la derecha
  for (const bit of bits) nibbles[Math.floor(bit / 4)] |= 1 << bit % 4;
  return nibbles
    .map((n) => n.toString(16))
    .reverse()
    .join("");
}

describe("decodeFeatures", () => {
  it("lee máscaras del entero de los últimos 8 hex y bits sueltos del string", () => {
    // bit 3 → carpetDeepClean (máscara 8); bit 8 → fastRoute (máscara 256);
    // bit 43 → petDeepClean; bit 40 → cornerMopStretch; bit 93 → cleanThenMop.
    const s = conBits([3, 8, 43, 40, 93]);
    const r = decodeFeatures({ newFeatureInfoStr: s });
    expect(r.carpetDeepClean).toBe(true);
    expect(r.fastRoute).toBe(true);
    expect(r.petDeepClean).toBe(true);
    expect(r.cornerMopStretch).toBe(true);
    expect(r.cleanThenMop).toBe(true);
    // No activados:
    expect(r.deepPlusRoute).toBe(false); // máscara 16777216 (bit 24)
    expect(r.floorDirection).toBe(false); // máscara 2048 (bit 11)
    expect(r.gapDeepClean).toBe(false); // bit 63
    expect(r.rightBrushStretch).toBe(false); // bit 54
    expect(r.customCleanMode).toBe(false); // bit 47
  });

  it("string vacío o corto = todo falso, sin reventar", () => {
    const r = decodeFeatures({ newFeatureInfoStr: "" });
    expect(Object.values(r).every((v) => v === false)).toBe(true);
    expect(decodeFeatures({}).petDeepClean).toBe(false);
  });

  it("un bit alto no aparece si el string es demasiado corto", () => {
    // bit 93 necesita >= 24 nibbles; con 8 no debe detectarse.
    const s = conBits([93], 8);
    expect(decodeFeatures({ newFeatureInfoStr: s }).cleanThenMop).toBe(false);
  });
});

describe("entradaFeatures", () => {
  it("usa newFeatureSet del home data si no hay init_status", () => {
    const e = entradaFeatures("00000108");
    expect(e.newFeatureInfoStr).toBe("00000108");
  });

  it("app_get_init_status tiene prioridad y aporta entero y lista", () => {
    const init = [{ new_feature_info_str: "abcd", new_feature_info: 123, feature_info: [1, 2] }];
    const e = entradaFeatures("00000108", init);
    expect(e.newFeatureInfoStr).toBe("abcd");
    expect(e.newFeatureInfo).toBe(123);
    expect(e.featureInfo).toEqual([1, 2]);
  });
});
