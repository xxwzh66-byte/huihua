/**
 * Unit tests assert the French source strings that live inside the code.
 * Pin the persisted locale so `t()` keeps returning those source strings no
 * matter what the app ships as its default language.
 */
const store = new Map<string, string>([["mochi-language", "fr"]]);

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  },
});
