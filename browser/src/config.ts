const env = (import.meta as any).env

export interface TGlobalConfig {
  urlServer: string
  urlClient: string
  leagueKey: 'marlow' | 'pul'
  title: string
}

const leagueKey = env.VITE_LEAGUE_KEY || 'marlow'

let title: string

switch (leagueKey) {
  case 'marlow':
    title = 'Marlow Street'
    break
  case 'pul':
    title = 'Perth Ultimate League'
    break
  default:
    title = 'Frisbee League'
    break
}

export const config: TGlobalConfig = {
  urlServer: env.VITE_URL_SERVER,
  urlClient: env.VITE_URL_CLIENT,
  leagueKey,
  title,
}
