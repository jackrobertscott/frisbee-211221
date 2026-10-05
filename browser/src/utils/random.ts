const ALPHANUMERICS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Random alphanumeric string (local keys for unsaved rows). */
export const randomString = (length = 10) => {
  let value = ''
  for (let i = 0; i < length; i++)
    value += ALPHANUMERICS[Math.floor(Math.random() * ALPHANUMERICS.length)]
  return value
}
