import {
  TGamedayImportConfigSafe,
  TGamedayImportRun,
} from '@shared/schemas/ioGamedayImport'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeSeason, testId} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {pickToday, renderScreen, userError} from '../common/screenTesting'
import {PortPage} from './PortPage'

const NOW = '2026-01-01T00:00:00.000Z'

const makeConfig = (
  seasonId: string,
  patch: Partial<TGamedayImportConfigSafe> = {},
): TGamedayImportConfigSafe => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  seasonId,
  username: 'league-admin',
  association: 'Perth Ultimate',
  competition: 'Winter League',
  scheduleEnabled: false,
  hasPassword: true,
  ...patch,
})

const makeRun = (seasonId: string, patch: Partial<TGamedayImportRun> = {}): TGamedayImportRun => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  configId: testId(),
  seasonId,
  trigger: 'manual',
  status: 'succeeded',
  association: 'Perth Ultimate',
  competition: 'Winter League',
  startedOn: '2026-02-01T09:00:00.000Z',
  finishedOn: '2026-02-01T09:01:00.000Z',
  rowsImported: 40,
  teamsCreated: 2,
  usersCreated: 10,
  membersCreated: 12,
  ...patch,
})

const admin = () => makeAuth({user: {admin: true}})

const tool = (name: RegExp) => screen.getByRole('button', {name})

describe('PortPage', () => {
  it('needs GameDay settings before an import can run', async () => {
    const season = makeSeason({name: 'Winter 2026'})
    const server = mockServer({
      '/PortGamedayImportLoad': () => ({runs: []}),
      '/PortGamedayImportSave': (payload) => makeConfig(season.id, payload as Partial<TGamedayImportConfigSafe>),
    })
    const {user} = renderScreen(<PortPage />, {auth: admin(), context: {season}})
    expect(await screen.findByText('No imports yet')).toBeInTheDocument()
    expect(server.payloads('/PortGamedayImportLoad')).toEqual([{seasonId: season.id}])
    expect(screen.getByText('Imports run once GameDay settings are saved.')).toBeInTheDocument()
    expect(tool(/Run GameDay import/)).toBeDisabled()
    expect(tool(/Run GameDay import/)).toHaveTextContent('Save GameDay settings first.')

    await user.click(tool(/^GameDay settings/))
    const dialog = await screen.findByRole('dialog', {name: 'GameDay import settings'})
    const save = within(dialog).getByRole('button', {name: 'Save settings'})
    expect(save).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox', {name: /Username/}), 'league-admin')
    await user.type(within(dialog).getByLabelText(/Password/), 'secret')
    await user.type(within(dialog).getByRole('textbox', {name: /Association/}), 'Perth Ultimate')
    await user.type(within(dialog).getByRole('textbox', {name: /Competition/}), 'Winter League')
    expect(save).toBeEnabled()

    // A schedule needs both dates.
    await user.click(within(dialog).getByRole('switch', {name: /Daily schedule/}))
    expect(save).toBeDisabled()
    await pickToday(user, within(dialog).getByRole('button', {name: /^Active from/}))
    await pickToday(user, within(dialog).getByRole('button', {name: /^Active until/}))
    expect(save).toBeEnabled()

    server.on('/PortGamedayImportLoad', () => ({runs: [], config: makeConfig(season.id)}))
    await user.click(save)
    expect(await screen.findByText('GameDay import settings saved.')).toBeInTheDocument()
    const [payload] = server.payloads('/PortGamedayImportSave') as Array<Record<string, unknown>>
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expect(payload).toEqual({
      seasonId: season.id,
      username: 'league-admin',
      password: 'secret',
      association: 'Perth Ultimate',
      competition: 'Winter League',
      scheduleEnabled: true,
      scheduleStartOn: today.toISOString(),
      scheduleEndOn: today.toISOString(),
    })
    await waitFor(() => expect(tool(/Run GameDay import/)).toBeEnabled())
    expect(tool(/^GameDay settings/)).toHaveTextContent('Saved for Perth Ultimate / Winter League.')
  })

  it('flags a schedule that ends before it starts', async () => {
    const season = makeSeason()
    const config = makeConfig(season.id, {
      scheduleEnabled: true,
      scheduleStartOn: '2026-05-10T08:30:00.000Z',
      scheduleEndOn: '2026-05-01T08:30:00.000Z',
    })
    mockServer({'/PortGamedayImportLoad': () => ({runs: [], config})})
    const {user} = renderScreen(<PortPage />, {auth: admin(), context: {season}})
    expect(await screen.findByText(/^Scheduled import runs daily after/)).toBeInTheDocument()
    await user.click(tool(/^GameDay settings/))
    const dialog = await screen.findByRole('dialog', {name: 'GameDay import settings'})
    expect(within(dialog).getByRole('textbox', {name: /Username/})).toHaveValue('league-admin')
    expect(within(dialog).getByText('A password is saved (encrypted). Leave blank to keep it.')).toBeInTheDocument()
    expect(within(dialog).getByText('Must be on or after the start date.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', {name: 'Save settings'})).toBeDisabled()
    await user.click(within(dialog).getAllByRole('button', {name: 'Close'})[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('runs a GameDay import and shows run details', async () => {
    const season = makeSeason({name: 'Winter 2026'})
    const config = makeConfig(season.id)
    const failed = makeRun(season.id, {
      status: 'failed',
      trigger: 'scheduled',
      errorMessage: 'Login rejected by GameDay',
      rowsImported: undefined,
      membersCreated: undefined,
    })
    const server = mockServer({
      '/PortGamedayImportLoad': () => ({runs: [failed], config}),
      '/PortGamedayImport': () => ({rowsImported: 40, teamsCreated: 1, usersCreated: 3, membersCreated: 5}),
    })
    const {user} = renderScreen(<PortPage />, {auth: admin(), context: {season}})
    const history = await screen.findByRole('table', {name: 'GameDay import history'})
    expect(await within(history).findByText('Login rejected by GameDay')).toBeInTheDocument()
    expect(screen.getByText('Imports run when triggered manually.')).toBeInTheDocument()

    await user.click(within(history).getByText('Scheduled'))
    const details = await screen.findByRole('dialog', {name: 'GameDay import run details'})
    expect(details).toHaveAccessibleDescription(
      'Failed — Scheduled import for Perth Ultimate / Winter League.',
    )
    await user.click(within(details).getAllByRole('button', {name: 'Close'})[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(tool(/Run GameDay import/))
    const confirm = await screen.findByRole('dialog', {name: 'Confirm GameDay import run'})
    expect(within(confirm).getByText('league-admin')).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', {name: 'Confirm run'}))
    expect(
      await screen.findByText('GameDay import finished. 5 membership(s) added.'),
    ).toBeInTheDocument()
    expect(server.payloads('/PortGamedayImport')).toEqual([{seasonId: season.id}])
    await waitFor(() => expect(server.payloads('/PortGamedayImportLoad')).toHaveLength(2))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Confirm GameDay import run'})).not.toBeInTheDocument(),
    )
  })

  it('reloads the history even when an import fails', async () => {
    const season = makeSeason()
    const server = mockServer({
      '/PortGamedayImportLoad': () => ({runs: [], config: makeConfig(season.id)}),
      '/PortGamedayImport': () => {
        throw userError(502, 'GameDay is unavailable.')
      },
    })
    const {user} = renderScreen(<PortPage />, {auth: admin(), context: {season}})
    await screen.findByText('No imports yet')
    await user.click(tool(/Run GameDay import/))
    await user.click(await screen.findByRole('button', {name: 'Confirm run'}))
    expect(await screen.findByText('GameDay is unavailable.')).toBeInTheDocument()
    await waitFor(() => expect(server.payloads('/PortGamedayImportLoad')).toHaveLength(2))
    expect(screen.getByRole('dialog', {name: 'Confirm GameDay import run'})).toBeInTheDocument()
  })

  it('opens the other tools', async () => {
    const season = makeSeason({name: 'Winter 2026'})
    mockServer({'/PortGamedayImportLoad': () => ({runs: []})})
    const {user} = renderScreen(<PortPage />, {auth: admin(), context: {season}})
    await screen.findByText('No imports yet')
    const open = async (name: RegExp, dialog: string) => {
      await user.click(tool(name))
      const el = await screen.findByRole('dialog', {name: dialog})
      await user.click(within(el).getByRole('button', {name: 'Cancel'}))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }
    await open(/Import CSV/, 'Import CSV')
    await open(/Export data/, 'Export data')
    await open(/Create mock data/, 'Generate mock data')
    await open(/Delete mock data/, 'Delete all mock data?')
  })

  it('disables season tools without a season', () => {
    mockServer()
    renderScreen(<PortPage />, {auth: admin(), context: {season: undefined}})
    expect(tool(/Import CSV/)).toBeDisabled()
    expect(tool(/Create mock data/)).toBeDisabled()
    expect(tool(/Export data/)).toBeEnabled()
    expect(screen.queryByText('GameDay import history')).not.toBeInTheDocument()
  })
})
