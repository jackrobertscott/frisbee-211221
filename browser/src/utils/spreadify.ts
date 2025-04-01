export const spreadify = <T>(data: T[] | undefined | null): T[] => {
  if (data === undefined || data === null) return []
  return data
}
