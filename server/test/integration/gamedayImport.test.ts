import {beforeAll, describe, expect, it, vi} from 'vitest'
import {runGamedayExportProcess} from '../../src/gameday/runExportProcess'
import {$GamedayImportConfig} from '../../src/tables/$GamedayImportConfig'
import {$GamedayImportRun} from '../../src/tables/$GamedayImportRun'
import {$Member} from '../../src/tables/$Member'
import {random} from '../../src/utils/random'
import {createSeason, signUp, TActor} from '../actors'
import {captureSecurityCodes, useTestServer} from '../harness'

vi.mock('../../src/gameday/runExportProcess', () => ({
  runGamedayExportProcess: vi.fn(),
}))

const server = useTestServer()
captureSecurityCodes()

const exportMock = vi.mocked(runGamedayExportProcess)

let admin: TActor

beforeAll(async () => {
  admin = await signUp(server, {admin: true})
})

const saveConfig = async (seasonId: string) => {
  const response = await server.call(
    '/PortGamedayImportSave',
    {
      seasonId,
      username: 'gd-user',
      password: 'gd-pass',
      association: 'Assoc',
      competition: 'Comp',
      scheduleEnabled: false,
    },
    {token: admin.token},
  )
  expect(response.status).toBe(200)
}

const runImport = (seasonId: string, token = admin.token) =>
  server.call('/PortGamedayImport', {seasonId}, {token})

describe('PortGamedayImport', () => {
  it('requires admin, a known season and saved credentials', async () => {
    const player = await signUp(server)
    expect((await runImport(random.generateId(), player.token)).status).toBe(403)
    expect((await runImport(random.generateId())).status).toBe(404)

    const season = await createSeason(server, admin, {name: 'No credentials'})
    const missing = await runImport(season.id)
    expect(missing.status).toBe(400)
    expect(missing.body.errorCode).toBe('gameday.credentials_missing')
    expect(exportMock).not.toHaveBeenCalled()
  })

  it('imports members, records the run and releases the lock', async () => {
    const season = await createSeason(server, admin, {name: 'GameDay manual'})
    await saveConfig(season.id)
    exportMock.mockResolvedValueOnce({
      members: [
        {teamName: 'Alpha', firstName: 'A', lastName: 'One', email: 'gd.a@example.com', gender: 'F'},
        {teamName: 'Alpha', firstName: 'B', lastName: 'Two', email: 'gd.b@example.com', gender: 'M'},
      ],
    })

    const response = await runImport(season.id)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      rowsImported: 2,
      teamsCreated: 1,
      usersCreated: 2,
      membersCreated: 2,
    })
    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({username: 'gd-user', password: 'gd-pass'}),
    )
    expect(await $Member.count({seasonId: season.id})).toBe(2)
    const config = await $GamedayImportConfig.getOne({seasonId: season.id})
    expect(config.scheduleLockToken).toBeUndefined()
    expect(config.scheduleLockedUntil).toBeUndefined()
    const runs = await $GamedayImportRun.getMany({seasonId: season.id})
    expect(runs.map((run) => [run.trigger, run.status])).toEqual([['manual', 'succeeded']])
  })

  it('refuses to start while another import holds the lock', async () => {
    const season = await createSeason(server, admin, {name: 'GameDay locked'})
    await saveConfig(season.id)
    const config = await $GamedayImportConfig.getOne({seasonId: season.id})
    const otherToken = random.generateId()
    await $GamedayImportConfig.updateOne(
      {id: config.id},
      {
        scheduleLockedUntil: new Date(Date.now() + 60_000).toISOString(),
        scheduleLockToken: otherToken,
      },
    )
    exportMock.mockClear()

    const response = await runImport(season.id)

    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('gameday.import_running')
    expect(exportMock).not.toHaveBeenCalled()
    // the other import's lock is left in place
    expect((await $GamedayImportConfig.getOne({id: config.id})).scheduleLockToken).toBe(
      otherToken,
    )
  })

  it('takes over an expired lock and releases it after a failed export', async () => {
    const season = await createSeason(server, admin, {name: 'GameDay failing'})
    await saveConfig(season.id)
    const config = await $GamedayImportConfig.getOne({seasonId: season.id})
    await $GamedayImportConfig.updateOne(
      {id: config.id},
      {
        scheduleLockedUntil: new Date(Date.now() - 1_000).toISOString(),
        scheduleLockToken: random.generateId(),
      },
    )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    exportMock.mockRejectedValueOnce(new Error('Login stayed on the login page.'))

    const response = await runImport(season.id)

    expect(response.status).toBe(500)
    const stored = await $GamedayImportConfig.getOne({id: config.id})
    expect(stored.scheduleLockToken).toBeUndefined()
    const runs = await $GamedayImportRun.getMany({seasonId: season.id})
    expect(runs.map((run) => [run.status, run.errorMessage])).toEqual([
      ['failed', 'Login stayed on the login page.'],
    ])
    vi.mocked(console.error).mockRestore()
  })
})
