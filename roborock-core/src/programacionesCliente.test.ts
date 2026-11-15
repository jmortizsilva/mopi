import { describe, expect, it } from "vitest";
import { borradorDe, borradorNuevo, parseProgramaciones } from "./programaciones";
import { RoborockClient } from "./roborockClient";
import type { HttpApi } from "./httpApi";

type Entrada = [string, string, unknown[]];

/** Robot simulado en memoria que entiende los comandos de programaciones y apunta el orden. */
function clienteConRobot(inicial: Entrada[]) {
  const robot: Entrada[] = inicial.map((e) => [...e] as Entrada);
  const orden: string[] = [];
  const client = new RoborockClient({ userData: null } as unknown as HttpApi);
  client.sendCommand = async (_duid: string, method: string, opts: { params?: unknown } = {}) => {
    orden.push(method);
    const p = opts.params as unknown[];
    if (method === "get_timer") return robot.map((e) => [...e]);
    if (method === "set_timer") {
      const [[id, cuerpo]] = p as [[string, unknown[]]];
      robot.push([id, "on", cuerpo]);
      return ["ok"];
    }
    if (method === "upd_timer") {
      const e = robot.find((x) => x[0] === p[0]);
      if (e) e[1] = p[1] as string;
      return ["ok"];
    }
    if (method === "del_timer") {
      const i = robot.findIndex((x) => x[0] === p[0]);
      if (i >= 0) robot.splice(i, 1);
      return ["ok"];
    }
    throw new Error("comando no simulado: " + method);
  };
  return { client, robot, orden };
}

const ORIGINAL: Entrada = ["100", "off", ["0 10 * * 2,3,4,5", ["start_clean", { fan_power: 108, segments: "6,7", water_box_mode: 200, mop_mode: 300 }]]];

describe("editarProgramacion", () => {
  it("crea antes de borrar, conserva desactivada y las habitaciones", async () => {
    const { client, robot, orden } = clienteConRobot([ORIGINAL]);
    const [original] = parseProgramaciones([ORIGINAL]);
    const nueva = await client.editarProgramacion("d", original, { ...borradorDe(original), hora: 9 }, () => 200);

    const escrituras = orden.filter((m) => m !== "get_timer");
    expect(escrituras).toEqual(["set_timer", "upd_timer", "del_timer"]);
    expect(nueva).toMatchObject({ id: "200", activa: false, hora: 9 });
    expect(nueva.params.segments).toBe("6,7");
    expect(robot.map((e) => e[0])).toEqual(["200"]);
  });

  it("si el robot no guarda la nueva, no toca la original", async () => {
    const { client, robot } = clienteConRobot([ORIGINAL]);
    client.sendCommand = (async (_d: string, method: string) => {
      if (method === "get_timer") return robot.map((e) => [...e]);
      return ["ok"]; // contesta ok pero no hace nada
    }) as typeof client.sendCommand;
    const [original] = parseProgramaciones([ORIGINAL]);
    await expect(client.editarProgramacion("d", original, borradorNuevo(), () => 200)).rejects.toThrow();
    expect(robot.map((e) => e[0])).toEqual(["100"]);
  });
});

describe("eliminarProgramacion", () => {
  it("falla si sigue en el robot", async () => {
    const { client, robot } = clienteConRobot([ORIGINAL]);
    client.sendCommand = (async (_d: string, method: string) => (method === "get_timer" ? robot : ["ok"])) as typeof client.sendCommand;
    await expect(client.eliminarProgramacion("d", "100")).rejects.toThrow();
  });
});
