import {TReportSearchRow} from '@shared/endpoints/ReportDef'
import {screen, waitFor, within} from '@testing-library/react'
import {beforeEach, describe, expect, it} from 'vitest'
import {makeAuth, makeSeason} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError, THandler} from '../../test/server'
import {
  chooseOption,
  findDialog,
  setupUser,
  spyToasts,
} from '../seasons/screenTestUtils'
import {makeLeague, makeReport} from './reportTestData'
import {ReportsPage} from './ReportsPage'

const admin = () => makeAuth({user: {admin: true}})

const setup = (
  opts: {
    rows?: (league: ReturnType<typeof makeLeague>) => TReportSearchRow[]
    count?: number
    handlers?: Record<string, THandler>
    official?: boolean
  } = {},
) => {
  const league = makeLeague()
  const season = makeSeason({genderDivision: 'mixed', useOfficialScoring: opts.official})
  const report = makeReport({
    teamId: league.ours.id,
    teamAgainstId: league.rivals.id,
    fixtureId: league.round1.id,
    scoreFor: 13,
    scoreAgainst: 9,
    spirit: 3,
    spiritP1: 1,
    spiritP2: 1,
    spiritP3: 1,
    spiritP4: 1,
    spiritP5: 1,
    mvpMale: league.max.id,
    mvpFemale: league.mia.id,
    spiritComment: ' Fun game ',
  })
  const row: TReportSearchRow = {
    report,
    fixtureTitle: 'Round 1',
    teamName: league.ours.name,
    teamColor: league.ours.color,
    againstName: league.rivals.name,
    againstColor: league.rivals.color,
    submitterName: 'Casey Captain',
  }
  const rows = opts.rows?.(league) ?? [row]
  const server = mockServer({
    '/FeatureDashboardReportsLoad': () => ({
      count: opts.count ?? rows.length,
      reports: rows,
      fixtures: league.fixtures,
      teams: league.teams,
    }),
    '/FeatureReportEditorLoad': () => ({
      fixtures: league.fixtures,
      teams: league.teams,
      againstOptions: league.against,
    }),
    ...opts.handlers,
  })
  const view = renderApp(<ReportsPage />, {auth: admin(), context: {season}})
  return {...view, league, season, report, server}
}

beforeEach(() => {
  window.history.replaceState(null, '', '/reports')
})

describe('ReportsPage list', () => {
  it('loads the season’s reports and shows each column', async () => {
    const {server, season} = setup()
    expect(screen.getByRole('table', {name: 'Score reports', busy: true})).toBeInTheDocument()
    const table = await screen.findByRole('table', {name: 'Score reports'})
    const [, row] = within(table).getAllByRole('row')
    expect(within(row).getByText('Round 1')).toBeInTheDocument()
    expect(within(row).getByText('Disc Jockeys')).toBeInTheDocument()
    expect(within(row).getByText('Rivals')).toBeInTheDocument()
    expect(within(row).getByText('13–9')).toBeInTheDocument()
    expect(within(row).getByText('3')).toBeInTheDocument()
    expect(within(row).getByLabelText('All MVP votes given')).toBeInTheDocument()
    expect(within(row).getByText('Fun game')).toBeInTheDocument()
    expect(within(row).getByText('Casey Captain')).toBeInTheDocument()
    expect(server.payloads('/FeatureDashboardReportsLoad')).toEqual([
      {seasonId: season.id, search: '', skip: 0, limit: 25},
    ])
  })

  it('totals the five spirit categories for official scoring', async () => {
    setup({official: true})
    const table = await screen.findByRole('table', {name: 'Score reports'})
    const [, row] = within(table).getAllByRole('row')
    expect(within(row).getByText('5')).toBeInTheDocument()
    expect(within(row).getByLabelText('Some MVP votes missing')).toBeInTheDocument()
  })

  it('flags reports without MVP votes or comments', async () => {
    setup({
      rows: (league) => [
        {
          report: makeReport({spiritComment: '  '}),
          fixtureTitle: 'Round 2',
          teamName: league.rivals.name,
          againstName: league.ours.name,
          submitterName: 'Someone',
        },
      ],
    })
    const table = await screen.findByRole('table', {name: 'Score reports'})
    const [, row] = within(table).getAllByRole('row')
    expect(within(row).getByLabelText('No MVP votes given')).toBeInTheDocument()
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  it('searches and pages on the server', async () => {
    const user = setupUser()
    const {server} = setup({count: 30})
    await screen.findByRole('table', {name: 'Score reports'})
    await user.click(screen.getByRole('button', {name: 'Next page'}))
    await waitFor(() =>
      expect(server.payloads('/FeatureDashboardReportsLoad').at(-1)).toMatchObject({skip: 25}),
    )
    server.on('/FeatureDashboardReportsLoad', () => ({
      count: 0,
      reports: [],
      fixtures: [],
      teams: [],
    }))
    await user.type(screen.getByPlaceholderText('Search reports'), 'zzz')
    expect(await screen.findByText('No matching reports')).toBeInTheDocument()
    expect(server.payloads('/FeatureDashboardReportsLoad').at(-1)).toMatchObject({
      search: 'zzz',
      skip: 0,
    })
  })

  it('shows an empty state before any reports arrive', async () => {
    setup({rows: () => []})
    expect(await screen.findByText('No reports yet')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    const user = setupUser()
    spyToasts()
    const {server} = setup({
      handlers: {
        '/FeatureDashboardReportsLoad': () => {
          throw serverError(500, 'Down')
        },
      },
    })
    expect(await screen.findByText('Couldn’t load this')).toBeInTheDocument()
    server.on('/FeatureDashboardReportsLoad', () => ({
      count: 0,
      reports: [],
      fixtures: [],
      teams: [],
    }))
    await user.click(screen.getByRole('button', {name: 'Try again'}))
    expect(await screen.findByText('No reports yet')).toBeInTheDocument()
  })

  it('sends non-admins home without loading', async () => {
    const server = mockServer()
    renderApp(<ReportsPage />, {auth: makeAuth()})
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(server.calls).toHaveLength(0)
  })
})

describe('ReportsPage editing', () => {
  it('creates a report for any team', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {league, server} = setup({handlers: {'/ReportCreate': () => makeReport()}})
    await screen.findByRole('table', {name: 'Score reports'})
    await user.click(screen.getByRole('button', {name: 'Create report'}))
    const modal = await findDialog('New report')
    await chooseOption(user, 'For', /Disc Jockeys/)
    const forScore = await within(modal).findByRole('spinbutton', {name: 'For score'})
    expect(within(modal).getByRole('combobox', {name: 'Fixture'})).toHaveTextContent('Round 2')
    await user.type(forScore, '11{Enter}')
    await user.type(within(modal).getByRole('spinbutton', {name: 'Against score'}), '4{Enter}')
    await user.click(within(modal).getByRole('button', {name: 'Submit report'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Report created.'))
    expect(server.payloads('/ReportCreate')).toEqual([
      expect.objectContaining({
        teamId: league.ours.id,
        teamAgainstId: league.rivals.id,
        fixtureId: league.round2.id,
        scoreFor: 11,
        scoreAgainst: 4,
      }),
    ])
    await waitFor(() =>
      expect(server.payloads('/FeatureDashboardReportsLoad').length).toBeGreaterThan(1),
    )
  })

  it('edits a report from its row and clears removed MVPs', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {report, server} = setup({handlers: {'/ReportUpdate': () => report}})
    await user.click(await screen.findByText('Casey Captain'))
    const modal = await findDialog('Edit report')
    const forScore = await within(modal).findByRole('spinbutton', {name: 'For score'})
    expect(within(modal).getByText('Casey Captain')).toBeInTheDocument()
    expect(within(modal).getByRole('combobox', {name: 'Fixture'})).toBeDisabled()
    expect(within(modal).getByRole('combobox', {name: 'For'})).toBeDisabled()
    expect(within(modal).getByRole('combobox', {name: 'Against'})).toBeDisabled()
    expect(forScore).toHaveValue('13')
    await user.clear(forScore)
    await user.type(forScore, '14{Enter}')
    const maleMvp = within(modal).getByRole('combobox', {name: /^Male MVP/})
    expect(maleMvp).toHaveTextContent('Max Opp')
    await user.click(within(maleMvp).getByRole('button', {name: 'Clear selection'}))
    expect(maleMvp).toHaveTextContent('Select a player')
    await user.click(within(modal).getByRole('button', {name: 'Save report'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Report updated.'))
    const [payload] = server.payloads('/ReportUpdate')
    expect(payload).toMatchObject({
      reportId: report.id,
      scoreFor: 14,
      scoreAgainst: 9,
      mvpMale: null,
      mvpFemale: report.mvpFemale,
    })
  })

  it('deletes a report after confirming', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {report, server} = setup({handlers: {'/ReportDelete': () => undefined}})
    await user.click(await screen.findByText('Casey Captain'))
    const modal = await findDialog('Edit report')
    await within(modal).findByRole('spinbutton', {name: 'For score'})
    await user.click(within(modal).getByRole('button', {name: 'Delete'}))
    const confirm = await findDialog('Delete report?')
    await user.click(within(confirm).getByRole('button', {name: 'Delete report'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Report deleted.'))
    expect(server.payloads('/ReportDelete')).toEqual([{reportId: report.id}])
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Edit report'})).not.toBeInTheDocument(),
    )
  })
})
