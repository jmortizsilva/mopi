/**
 * deviceFeatures — decodifica las capacidades del modelo desde las "feature flags" del robot.
 *
 * Cada modelo Roborock publica un string hex de capacidades: viene en el home data
 * (`device.newFeatureSet`) y también en `app_get_init_status`. Decodificando bits/máscaras se sabe
 * qué admite el aparato SIN sondear comando a comando. Es el mecanismo que usa la integración de
 * Home Assistant.
 *
 * Portado (reescrito, no copiado) de python-roborock `roborock/device_features.py`
 * (Apache-2.0, https://github.com/Python-roborock/python-roborock). Solo los rasgos que usa
 * nuestra interfaz. Los números de bit/máscara son hechos del protocolo.
 */

export interface EntradaFeatures {
  /** Entero (reglas "intMask"/upper-32). Suele venir de app_get_init_status. */
  newFeatureInfo?: number;
  /** String hex (reglas "strMask"/"strBit"). Viene en el home data (newFeatureSet). */
  newFeatureInfoStr?: string;
  /** Lista de ids (regla "lista"). Suele venir de app_get_init_status. */
  featureInfo?: number[];
}

export interface RasgosDispositivo {
  fastRoute: boolean; // ruta de fregado "Rápido"
  deepPlusRoute: boolean; // ruta "Profundo+"
  carpetDeepClean: boolean; // limpieza profunda de alfombra
  floorDirection: boolean; // patrón/dirección de limpieza
  petDeepClean: boolean; // limpieza profunda en comederos
  gapDeepClean: boolean; // limpieza profunda de huecos/esquinas
  cornerMopStretch: boolean; // la mopa se estira en esquinas
  rightBrushStretch: boolean; // FlexiArm (cepillo derecho)
  cleanThenMop: boolean; // soporta "aspirar y luego fregar" (seq_type)
  customCleanMode: boolean; // modo por habitación
}

type Regla =
  | { tipo: "strMask"; mask: number; slice: number }
  | { tipo: "strBit"; bit: number }
  | { tipo: "intMask"; mask: number }
  | { tipo: "lista"; id: number };

// Máscaras/bits tomados de device_features.py (mismos valores que usa Home Assistant).
const REGLAS: Record<keyof RasgosDispositivo, Regla> = {
  fastRoute: { tipo: "strMask", mask: 256, slice: 8 },
  deepPlusRoute: { tipo: "strMask", mask: 16777216, slice: 8 },
  carpetDeepClean: { tipo: "strMask", mask: 8, slice: 8 },
  floorDirection: { tipo: "strMask", mask: 2048, slice: 8 },
  petDeepClean: { tipo: "strBit", bit: 43 },
  gapDeepClean: { tipo: "strBit", bit: 63 },
  cornerMopStretch: { tipo: "strBit", bit: 40 },
  rightBrushStretch: { tipo: "strBit", bit: 54 },
  cleanThenMop: { tipo: "strBit", bit: 93 },
  customCleanMode: { tipo: "strBit", bit: 47 },
};

/** Máscara contra el entero de los últimos `slice` caracteres hex del string. */
function strMask(str: string, mask: number, slice: number): boolean {
  if (!str || str.length < slice) return false;
  const val = parseInt(str.slice(-slice), 16);
  return Number.isFinite(val) && (mask & val) !== 0;
}

/** Bit `bit` dentro del string hex: carácter = str[-(1 + bit/4)], bit interno = bit % 4. */
function strBit(str: string, bit: number): boolean {
  if (!str) return false;
  const charFromEnd = 1 + Math.floor(bit / 4);
  if (charFromEnd > str.length) return false;
  const nibble = parseInt(str[str.length - charFromEnd], 16);
  if (!Number.isFinite(nibble)) return false;
  return ((nibble >> (bit % 4)) & 1) !== 0;
}

export function decodeFeatures(e: EntradaFeatures): RasgosDispositivo {
  const str = e.newFeatureInfoStr ?? "";
  const info = e.newFeatureInfo ?? 0;
  const lista = e.featureInfo ?? [];
  const out = {} as RasgosDispositivo;
  for (const nombre of Object.keys(REGLAS) as (keyof RasgosDispositivo)[]) {
    const r = REGLAS[nombre];
    switch (r.tipo) {
      case "strMask":
        out[nombre] = strMask(str, r.mask, r.slice);
        break;
      case "strBit":
        out[nombre] = strBit(str, r.bit);
        break;
      case "intMask":
        out[nombre] = (r.mask & info) !== 0;
        break;
      case "lista":
        out[nombre] = lista.includes(r.id);
        break;
    }
  }
  return out;
}

/**
 * Arma la entrada a partir del home data (`newFeatureSet`) y, si está, de `app_get_init_status`
 * (que aporta el entero y la lista además del string).
 */
export function entradaFeatures(newFeatureSet: string | undefined, initStatus?: unknown): EntradaFeatures {
  const raw = (Array.isArray(initStatus) ? initStatus[0] : initStatus) as Record<string, unknown> | undefined;
  const str = (raw?.new_feature_info_str as string) ?? newFeatureSet ?? "";
  const info = typeof raw?.new_feature_info === "number" ? (raw.new_feature_info as number) : undefined;
  const lista = Array.isArray(raw?.feature_info) ? (raw.feature_info as number[]) : undefined;
  return { newFeatureInfoStr: str, newFeatureInfo: info, featureInfo: lista };
}
