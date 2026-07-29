/**
 * pendingRequests — correlación petición/respuesta por messageID.
 *
 * Cada comando lleva un `id` numérico; la respuesta del robot (protocol 102) trae el mismo
 * `id`. Aquí guardamos las promesas pendientes y las resolvemos al llegar la respuesta.
 * Aislado de la red para poder testearlo sin MQTT.
 */
export interface PendingOptions {
  timeoutMs?: number;
}

interface Entry {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

export class PendingRequests {
  private readonly map = new Map<number, Entry>();
  private counter = 0;

  /** Genera el siguiente messageID (1..9999). */
  nextId(): number {
    this.counter = this.counter >= 9999 ? 1 : this.counter + 1;
    return this.counter;
  }

  /** Registra una petición y devuelve la promesa que se resolverá con el resultado. */
  add(id: number, method: string, opts: PendingOptions = {}): Promise<unknown> {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.map.delete(id);
        reject(new Error(`Timeout esperando respuesta de '${method}' (id ${id}) tras ${timeoutMs}ms`));
      }, timeoutMs);
      // Evita retener el proceso vivo en Node por culpa del timer
      (timer as unknown as { unref?: () => void }).unref?.();
      this.map.set(id, { resolve, reject, timer, method });
    });
  }

  /** Resuelve la petición pendiente con el resultado (si existe). */
  resolve(id: number, result: unknown): boolean {
    const entry = this.map.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.map.delete(id);
    entry.resolve(result);
    return true;
  }

  /** Rechaza una petición concreta. */
  reject(id: number, err: Error): boolean {
    const entry = this.map.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.map.delete(id);
    entry.reject(err);
    return true;
  }

  /** Rechaza todas las pendientes (p. ej. al desconectar). */
  rejectAll(err: Error): void {
    for (const [id, entry] of this.map) {
      clearTimeout(entry.timer);
      entry.reject(err);
      this.map.delete(id);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
