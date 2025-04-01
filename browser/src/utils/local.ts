export const local = {
  /**
   *
   */
  get(key: string) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw)
    } catch {
      localStorage.removeItem(key)
      return undefined
    }
  },
  /**
   *
   */
  set(key: string, value: any) {
    try {
      const data = JSON.stringify(value)
      localStorage.setItem(key, data)
    } catch {
      localStorage.removeItem(key)
    }
  },
  /**
   *
   */
  remove(key: string) {
    localStorage.removeItem(key)
  },
}
