import { describe, expect, it } from "vitest";
import { joinRoomMapping } from "./roborockClient";

// Datos REALES del Qrevo S5V (get_room_mapping + habitaciones de la casa).
const MAPPING = [
  [1, "46915217", 8],
  [2, "46915241", 1],
  [3, "46915232", 12],
  [4, "46915141", 15],
  [5, "46915137", 6],
  [6, "46915145", 14],
];

const HOME_ROOMS = [
  { id: 46915470, name: "Predeterminado" },
  { id: 46915390, name: "Habitación pequeña 1" },
  { id: 46915241, name: "Dormitorio" },
  { id: 46915232, name: "Habitación pequeña" },
  { id: 46915217, name: "Pasillo" },
  { id: 46915145, name: "Cocina" },
  { id: 46915141, name: "Baño" },
  { id: 46915137, name: "Salón" },
];

describe("joinRoomMapping", () => {
  it("cruza segmentos del mapa con nombres reales", () => {
    const rooms = joinRoomMapping(MAPPING, HOME_ROOMS);
    expect(rooms).toEqual([
      { segmentId: 1, roomId: "46915217", name: "Pasillo" },
      { segmentId: 2, roomId: "46915241", name: "Dormitorio" },
      { segmentId: 3, roomId: "46915232", name: "Habitación pequeña" },
      { segmentId: 4, roomId: "46915141", name: "Baño" },
      { segmentId: 5, roomId: "46915137", name: "Salón" },
      { segmentId: 6, roomId: "46915145", name: "Cocina" },
    ]);
  });

  it("excluye las habitaciones fantasma (no salen porque no están en el mapa)", () => {
    const names = joinRoomMapping(MAPPING, HOME_ROOMS).map((r) => r.name);
    expect(names).not.toContain("Predeterminado");
    expect(names).not.toContain("Habitación pequeña 1");
    expect(names).toHaveLength(6);
  });

  it("usa un nombre por defecto si el segmento no tiene habitación en la casa", () => {
    const rooms = joinRoomMapping([[9, "99999"]], HOME_ROOMS);
    expect(rooms[0]).toEqual({ segmentId: 9, roomId: "99999", name: "Habitación 9" });
  });

  it("devuelve vacío si el mapeo no es un array", () => {
    expect(joinRoomMapping("ok", HOME_ROOMS)).toEqual([]);
  });
});
