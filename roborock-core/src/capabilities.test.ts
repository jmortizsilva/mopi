import { describe, expect, it } from "vitest";
import { capabilitiesFromDump, resolveCapabilities } from "./capabilities";

describe("capabilitiesFromDump", () => {
  it("detecta las funciones de la estación cuando el GET devolvió un objeto usable", () => {
    const caps = capabilitiesFromDump({
      dust_collection_switch: { status: 1 },
      dryer_setting: { status: 0, dry_time: 7200 },
      wash_towel_mode: { wash_mode: 1 },
    });
    expect(caps).toEqual({ autoEmptyDock: true, mopDrying: true, mopWashStation: true });
  });

  it("acepta respuestas envueltas en array", () => {
    const caps = capabilitiesFromDump({ dryer_setting: [{ status: 1 }] });
    expect(caps.mopDrying).toBe(true);
  });

  it("no marca la función si el comando falló ({error}) o vino vacío", () => {
    const caps = capabilitiesFromDump({
      dust_collection_switch: { error: "unsupported" },
      dryer_setting: {},
      wash_towel_mode: undefined,
    });
    expect(caps).toEqual({ autoEmptyDock: false, mopDrying: false, mopWashStation: false });
  });
});

describe("resolveCapabilities", () => {
  it("sin dump ni modelo, no muestra nada (todo false)", () => {
    expect(resolveCapabilities(null, null)).toEqual({
      autoEmptyDock: false,
      mopDrying: false,
      mopWashStation: false,
    });
  });

  it("la tabla del modelo corrige el runtime (Qrevo S5V tiene base todo-en-uno)", () => {
    // El runtime falló al leer la estación, pero el modelo conocido sí la tiene.
    const dump = { dust_collection_switch: { error: "timeout" }, dryer_setting: {} };
    const caps = resolveCapabilities("roborock.vacuum.a170", dump);
    expect(caps).toEqual({ autoEmptyDock: true, mopDrying: true, mopWashStation: true });
  });

  it("modelo desconocido: decide solo el runtime", () => {
    const caps = resolveCapabilities("roborock.vacuum.unknown", { dryer_setting: { status: 1 } });
    expect(caps).toEqual({ autoEmptyDock: false, mopDrying: true, mopWashStation: false });
  });
});
