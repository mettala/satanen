import type { StorageBackend } from './store';

/** In-memory stand-in for AsyncStorage, for tests. */
export function createMemoryBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const backend: StorageBackend & { data: Map<string, string> } = {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
  return backend;
}
