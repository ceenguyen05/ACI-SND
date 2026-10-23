type Handler<T> = (payload: T) => void;

/** Minimal strongly-typed pub/sub used to decouple simulation from rendering, audio and UI. */
export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<any>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (set) for (const fn of set) fn(payload);
  }

  clear(): void { this.handlers.clear(); }
}
