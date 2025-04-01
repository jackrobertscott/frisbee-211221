const env = (import.meta as any).env
/**
 *
 */
export interface TGlobalConfig {
  urlServer: string
  urlClient: string
  isMarlow: boolean
}
/**
 *
 */
export const config: TGlobalConfig = {
  urlServer: env.VITE_URL_SERVER,
  urlClient: env.VITE_URL_CLIENT,
  isMarlow: true, // env.VITE_IS_MARLOW === 'true',
}
