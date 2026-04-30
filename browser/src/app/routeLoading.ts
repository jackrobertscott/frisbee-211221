const counts = new Map<string, number>()
const listeners = new Set<() => void>()

const _normalize = (pathname?: string) => pathname || '/'

const _emit = () => {
  listeners.forEach((listener) => listener())
}

export const routeLoadingStart = (pathname?: string) => {
  const key = _normalize(pathname)
  counts.set(key, (counts.get(key) ?? 0) + 1)
  _emit()
}

export const routeLoadingEnd = (pathname?: string) => {
  const key = _normalize(pathname)
  const next = Math.max(0, (counts.get(key) ?? 0) - 1)
  if (next > 0) counts.set(key, next)
  else counts.delete(key)
  _emit()
}

export const getRouteLoadingCount = (pathname?: string) => {
  return counts.get(_normalize(pathname)) ?? 0
}

export const subscribeRouteLoading = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
