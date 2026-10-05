/** Case-insensitive patterns built from user input, plus shared format checks. */
export const regex = {
  escape(value = '') {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  },
  from(value = '') {
    return new RegExp(regex.escape(value), 'i')
  },
  normalize(value = '') {
    return new RegExp(`^${regex.escape(value.trim())}$`, 'i')
  },
  startsWith(value = '') {
    return new RegExp(`^${regex.escape(value.trim())}`, 'i')
  },
  endsWith(value = '') {
    return new RegExp(`${regex.escape(value.trim())}$`, 'i')
  },
  email() {
    return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  },
  hsla() {
    return /^hsla\(\s*(-?\d+(?:\.\d+)?)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*(\d*(?:\.\d+)?)\s*\)$/
  },
}
