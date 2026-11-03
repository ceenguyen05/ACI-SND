type Handler<T> = (payload: T) => void;

/** Minimal strongly-typed pub/sub used to decouple simulation from rendering, audio and UI. */
export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<any>>>();
  private observers = new Set<(type: keyof E, payload: E[keyof E]) => void>();

  /** Observe emitted events without coupling simulation to a transport. */
  onAny(fn: (type: keyof E, payload: E[keyof E]) => void): () => void {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const fn of this.observers) fn(type, payload);
    const set = this.handlers.get(type);
    if (set) for (const fn of set) fn(payload);
  }

  clear(): void { this.handlers.clear(); this.observers.clear(); }
}
