import { describe, expect, it } from "vitest";
import { controlesSegunEstado, decodeStatus, summarizeStatus } from "./statusDecoder";

// Fixture REAL capturado del Qrevo S5V (roborock.vacuum.a170, pv 1.0).
const REAL_STATUS = [
  {
    msg_ver: 2,
    msg_seq: 1190,
    state: 8,
    battery: 100,
    clean_time: 135,
    clean_area: 2060000,
    error_code: 0,
    map_present: 1,
    in_cleaning: 0,
    in_returning: 0,
    fan_power: 102,
    water_box_mode: 202,
    mop_mode: 300,
    charge_status: 1,
    dock_type: 22,
  },
];

describe("decodeStatus con la respuesta real del Qrevo S5V", () => {
  it("traduce los códigos a etiquetas en español", () => {
    const d = decodeStatus(REAL_STATUS);
    expect(d.state).toEqual({ code: 8, label: "Cargando" });
    expect(d.battery).toBe(100);
    expect(d.charging).toBe(true);
    expect(d.cleaning).toBe(false);
    expect(d.hasError).toBe(false);
    expect(d.error.label).toBe("Sin errores");
    expect(d.fanPower).toEqual({ code: 102, label: "Equilibrado" });
    expect(d.waterBox).toEqual({ code: 202, label: "Medio" });
    expect(d.mopMode).toEqual({ code: 300, label: "Estándar" });
    expect(d.mapPresent).toBe(true);
    expect(d.cleanAreaM2).toBe(2.06);
  });

  it("acepta tanto el array como el objeto directo", () => {
    const fromArray = decodeStatus(REAL_STATUS);
    const fromObject = decodeStatus(REAL_STATUS[0]);
    expect(fromObject.state.label).toBe(fromArray.state.label);
  });

  it("genera una frase accesible con estado y batería (sin config de succión/agua)", () => {
    const frase = summarizeStatus(decodeStatus(REAL_STATUS));
    expect(frase).toBe("Cargando. Batería 100 por ciento.");
  });

  it("incluye la actividad del dock cuando la hay", () => {
    const frase = summarizeStatus(decodeStatus({ ...REAL_STATUS[0], dry_status: 1 }));
    expect(frase).toBe("Cargando. Batería 100 por ciento. Secando mopa.");
  });

  it("muestra el tiempo restante de secado (rdt real = 7800s)", () => {
    const d = decodeStatus({ ...REAL_STATUS[0], dry_status: 1, rdt: 7800 });
    expect(d.dryRemainingSec).toBe(7800);
    expect(d.dockActivity).toBe("Secando mopa, quedan 2 h 10 min");
    expect(summarizeStatus(d)).toBe("Cargando. Batería 100 por ciento. Secando mopa, quedan 2 h 10 min.");
  });

  it("añade avisos de falta de agua y error de base", () => {
    const d = decodeStatus({ ...REAL_STATUS[0], water_shortage_status: 1, dock_error_status: 3 });
    expect(d.warnings).toEqual(["Falta agua en el depósito", "Error en la base"]);
    expect(summarizeStatus(d)).toContain("Falta agua en el depósito");
  });

  it("códigos desconocidos no rompen: devuelven texto con el número", () => {
    const d = decodeStatus({ state: 999, error_code: 777 });
    expect(d.state.label).toBe("Desconocido (código 999)");
    expect(d.error.label).toBe("Desconocido (código 777)");
    expect(d.hasError).toBe(true);
  });

  it("marca error cuando error_code no es 0", () => {
    const d = decodeStatus({ state: 12, error_code: 3 });
    expect(d.hasError).toBe(true);
    expect(d.error.label).toBe("Rueda en el aire");
    expect(d.state.label).toBe("Error");
  });
});

describe("controlesSegunEstado", () => {
  const mk = (over: Record<string, unknown>) => decodeStatus([{ state: 3, battery: 50, ...over }]);

  it("estado desconocido (null): permisivo, todo habilitado", () => {
    expect(controlesSegunEstado(null)).toEqual({ empezar: true, pausar: true, parar: true, dock: true });
  });

  it("cargando en la base: solo empezar (no pausar/parar/dock)", () => {
    const c = controlesSegunEstado(mk({ state: 8, charge_status: 1 }));
    expect(c).toEqual({ empezar: true, pausar: false, parar: false, dock: false });
  });

  it("limpiando: pausar, parar y dock; empezar no", () => {
    const c = controlesSegunEstado(mk({ state: 5, in_cleaning: 1 }));
    expect(c).toEqual({ empezar: false, pausar: true, parar: true, dock: true });
  });

  it("en pausa: reanudar (empezar) y parar; pausar no", () => {
    const c = controlesSegunEstado(mk({ state: 10, in_cleaning: 1 }));
    expect(c.empezar).toBe(true);
    expect(c.pausar).toBe(false);
    expect(c.parar).toBe(true);
  });

  it("volviendo a la base: no se ofrece dock otra vez", () => {
    const c = controlesSegunEstado(mk({ state: 6, in_returning: 1 }));
    expect(c.dock).toBe(false);
    expect(c.parar).toBe(true);
  });
});
