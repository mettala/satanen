// A tiny JSON store on top of a key-value backend (AsyncStorage in the app).
// Reads never throw: missing or damaged data falls back to the default.

export const KEY_PREFIX = 'satanen:v1:';

export interface StorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let backend: StorageBackend | null = null;

export function setStorageBackend(b: StorageBackend | null): void {
  backend = b;
}

/** The backend in use, for modules that store more than one small value (src/data/pageCache). */
export function getStorageBackend(): StorageBackend | null {
  return backend;
}

export interface Store<T> {
  readonly key: string;
  /** Current value; the default until the saved value has been read. */
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  /** Resolves once the saved value has been read (never rejects). */
  ready(): Promise<void>;
  /** Replaces the value, notifies subscribers and saves it (never rejects). */
  set(value: T): Promise<void>;
  /** Waits for the saved value, then applies `fn` to it. */
  update(fn: (current: T) => T): Promise<void>;
  /** Forgets the cached value and reads again on next `ready()`. Mainly for tests. */
  reset(): void;
}

export function createStore<T>(
  name: string,
  defaultValue: T,
  /** Returns a clean value, or undefined if the data has the wrong shape. */
  parse: (raw: unknown) => T | undefined,
): Store<T> {
  const key = KEY_PREFIX + name;
  let value = defaultValue;
  let loaded: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());

  async function load(): Promise<void> {
    try {
      const text = await backend?.getItem(key);
      if (text != null) {
        const parsed = parse(JSON.parse(text));
        if (parsed !== undefined) value = parsed;
      }
    } catch {
      // damaged or unreadable: keep the default
    }
    notify();
  }

  const ready = () => (loaded ??= load());

  async function persist(): Promise<void> {
    try {
      await backend?.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or unavailable: the in-memory value still works
    }
  }

  return {
    key,
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      void ready();
      return () => {
        listeners.delete(listener);
      };
    },
    ready,
    async set(next) {
      await ready();
      value = next;
      notify();
      await persist();
    },
    async update(fn) {
      await ready();
      value = fn(value);
      notify();
      await persist();
    },
    reset() {
      value = defaultValue;
      loaded = null;
      notify();
    },
  };
}
