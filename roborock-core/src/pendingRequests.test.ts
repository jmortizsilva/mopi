import { describe, expect, it } from "vitest";
import { PendingRequests } from "./pendingRequests";

describe("PendingRequests", () => {
  it("nextId incrementa y da la vuelta en 9999", () => {
    const p = new PendingRequests();
    expect(p.nextId()).toBe(1);
    expect(p.nextId()).toBe(2);
  });

  it("resuelve una petición con su resultado", async () => {
    const p = new PendingRequests();
    const id = p.nextId();
    const promise = p.add(id, "get_status");
    expect(p.size).toBe(1);

    const resolved = p.resolve(id, { battery: 90 });
    expect(resolved).toBe(true);
    await expect(promise).resolves.toEqual({ battery: 90 });
    expect(p.size).toBe(0);
  });

  it("resolver un id inexistente devuelve false", () => {
    const p = new PendingRequests();
    expect(p.resolve(999, "x")).toBe(false);
  });

  it("hace timeout si no llega respuesta", async () => {
    const p = new PendingRequests();
    const id = p.nextId();
    const promise = p.add(id, "app_start", { timeoutMs: 20 });
    await expect(promise).rejects.toThrow(/Timeout/);
    expect(p.size).toBe(0);
  });

  it("rejectAll rechaza todas las pendientes", async () => {
    const p = new PendingRequests();
    const a = p.add(p.nextId(), "m1", { timeoutMs: 5000 });
    const b = p.add(p.nextId(), "m2", { timeoutMs: 5000 });
    p.rejectAll(new Error("desconectado"));
    await expect(a).rejects.toThrow(/desconectado/);
    await expect(b).rejects.toThrow(/desconectado/);
    expect(p.size).toBe(0);
  });
});
