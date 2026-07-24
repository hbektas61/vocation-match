/**
 * Session storage for the Supabase client.
 *
 * On a device the tokens go to the platform keychain/keystore through
 * `expo-secure-store`. SecureStore rejects values over ~2 KB, and a session
 * blob can exceed that, so values are chunked. Where SecureStore is not
 * available (web, tests) the adapter falls back to memory: the session simply
 * does not survive a reload, which is the safe direction to fail.
 */
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createMemoryStorage(): SessionStorage {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

export function createSecureStorage(): SessionStorage {
  return {
    async getItem(key) {
      const countRaw = await SecureStore.getItemAsync(key);
      if (countRaw === null) {
        return null;
      }
      const count = Number(countRaw);
      if (!Number.isInteger(count) || count < 1) {
        return null;
      }
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        if (part === null) {
          return null; // partial write: treat as signed out rather than corrupt.
        }
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      await this.removeItem(key);
      const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < count; i += 1) {
        await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await SecureStore.setItemAsync(key, String(count));
    },

    async removeItem(key) {
      const countRaw = await SecureStore.getItemAsync(key);
      const count = Number(countRaw);
      if (Number.isInteger(count) && count > 0) {
        for (let i = 0; i < count; i += 1) {
          await SecureStore.deleteItemAsync(chunkKey(key, i));
        }
      }
      await SecureStore.deleteItemAsync(key);
    },
  };
}

/**
 * SecureStore when the platform supports it, memory otherwise. Availability
 * cannot be decided synchronously, so the adapter tries the keychain and
 * switches to memory for good the first time the platform refuses.
 */
export function createSessionStorage(
  secure: SessionStorage = createSecureStorage(),
  memory: SessionStorage = createMemoryStorage(),
): SessionStorage {
  let backend = secure;

  async function attempt<T>(run: (store: SessionStorage) => Promise<T>): Promise<T> {
    try {
      return await run(backend);
    } catch (error) {
      if (backend === memory) {
        throw error;
      }
      backend = memory;
      return run(backend);
    }
  }

  return {
    getItem: (key) => attempt((store) => store.getItem(key)),
    setItem: (key, value) => attempt((store) => store.setItem(key, value)),
    removeItem: (key) => attempt((store) => store.removeItem(key)),
  };
}
