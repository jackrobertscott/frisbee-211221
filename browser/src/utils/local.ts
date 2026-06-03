export const local = {
  get<T = unknown>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      localStorage.removeItem(key)
      return undefined
    }
  },

  set(key: string, value: unknown) {
    try {
      const data = JSON.stringify(value)
      localStorage.setItem(key, data)
    } catch {
      localStorage.removeItem(key)
    }
  },

  has(key: string) {
    return localStorage.getItem(key) !== null
  },

  remove(key: string) {
    localStorage.removeItem(key)
  },
}
