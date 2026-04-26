import config from '../config'

const normalizeOrigin = (value?: string) => {
  if (!value?.trim()) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

const allowedOrigin = normalizeOrigin(config.urlClient)

export const origin = {
  normalize: normalizeOrigin,
  allowed() {
    return allowedOrigin ?? config.urlClient
  },
  isAllowed(value?: string) {
    const normalized = normalizeOrigin(value)
    return Boolean(normalized && allowedOrigin && normalized === allowedOrigin)
  },
}
