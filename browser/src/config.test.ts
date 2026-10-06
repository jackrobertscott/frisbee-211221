import {afterEach, describe, expect, it, vi} from 'vitest'

const loadConfig = async () => {
  vi.resetModules()
  const {config} = await import('./config')
  return config
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('config', () => {
  it('reads server and client urls from the environment', async () => {
    const config = await loadConfig()
    expect(config.urlServer).toBe('http://server.test')
    expect(config.urlClient).toBe('http://client.test')
  })

  it('defaults to the Marlow league', async () => {
    vi.stubEnv('VITE_LEAGUE_KEY', '')
    const config = await loadConfig()
    expect(config.leagueKey).toBe('marlow')
    expect(config.title).toBe('Marlow Street Ultimate')
  })

  it('titles the Perth league', async () => {
    vi.stubEnv('VITE_LEAGUE_KEY', 'pul')
    const config = await loadConfig()
    expect(config.leagueKey).toBe('pul')
    expect(config.title).toBe('Perth Ultimate League')
  })

  it('uses a generic title for unknown leagues', async () => {
    vi.stubEnv('VITE_LEAGUE_KEY', 'other')
    const config = await loadConfig()
    expect(config.title).toBe('Frisbee League')
  })
})
