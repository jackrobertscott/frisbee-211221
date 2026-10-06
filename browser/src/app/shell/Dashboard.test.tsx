import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {renderScreen} from '../common/screenTesting'
import {Dashboard} from './Dashboard'

const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent)

const dashboardServer = (seasons = [makeSeason()]) =>
  mockServer({
    '/SeasonList': () => seasons,
    '/FeatureCompetitionLoad': () => ({teams: [], fixtures: []}),
    '/FeatureDashboardTeamsLoad': () => ({count: 0, teams: []}),
    '/FeatureDashboardSpiritLoad': () => ({rows: []}),
    '/PortGamedayImportLoad': () => ({runs: []}),
  })

describe('Dashboard', () => {
  it('shows public sections to visitors and asks them to sign in to report', async () => {
    const season = makeSeason()
    const server = dashboardServer([season])
    const pushState = vi.spyOn(window.history, 'pushState')
    const {user} = renderScreen(<Dashboard />, {path: '/fixtures', context: {season}})
    expect(tabNames()).toEqual(['Ladder', 'Fixtures', 'Teams'])
    expect(screen.getByRole('tab', {name: 'Fixtures'})).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('No fixtures yet')).toBeInTheDocument()
    expect(server.payloads('/SeasonList')).toEqual([{}])
    // One season and not an admin: no season switcher.
    expect(screen.queryByRole('button', {name: /^Season:/})).not.toBeInTheDocument()
    expect(screen.getByRole('link', {name: /Accreditation/})).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Report score'}))
    expect(await screen.findByText('Please sign in to submit a score report.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/auth')

    await user.click(screen.getByRole('button', {name: 'Log in'}))
    expect(window.location.pathname).toBe('/auth/welcome')

    await user.click(screen.getByRole('tab', {name: 'Teams'}))
    expect(window.location.pathname).toBe('/teams')
    expect(pushState).toHaveBeenCalled()
  })

  it('shows the teams page for its route', async () => {
    const season = makeSeason()
    dashboardServer([season])
    renderScreen(<Dashboard />, {path: '/teams', context: {season}})
    expect(await screen.findByRole('table', {name: 'Teams'})).toBeInTheDocument()
    expect(screen.getByRole('tab', {name: 'Teams'})).toHaveAttribute('aria-selected', 'true')
  })

  it('asks signed in players without a team to join one before reporting', async () => {
    const season = makeSeason()
    mockServer({
      '/SeasonList': () => [season],
      '/FeatureCompetitionLoad': () => ({teams: [], fixtures: []}),
      '/FeatureTeamSetupLoad': () => ({teams: []}),
    })
    const {user} = renderScreen(<Dashboard />, {
      path: '/fixtures',
      auth: makeAuth({user: {firstName: 'Alex', lastName: 'Player'}}),
      context: {season},
    })
    await screen.findByText('No fixtures yet')
    await user.click(screen.getByRole('button', {name: 'Report score'}))
    expect(await screen.findByText('Please join a team to submit a score report.')).toBeInTheDocument()
    const join = await screen.findByRole('dialog', {name: 'Join a team'})
    expect(await within(join).findByText('No teams found')).toBeInTheDocument()
    await user.click(within(join).getAllByRole('button', {name: 'Close'})[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', {name: 'Join a team'}))
    expect(await screen.findByRole('dialog', {name: 'Join a team'})).toBeInTheDocument()
  })

  it('lets signed in players log out from the account menu', async () => {
    const season = makeSeason()
    const team = makeTeam({seasonId: season.id, name: 'Red Rockets'})
    dashboardServer([season])
    const {user, context} = renderScreen(<Dashboard />, {
      path: '/fixtures',
      auth: makeAuth({user: {firstName: 'Alex', lastName: 'Player'}, team}),
      context: {season},
    })
    await screen.findByText('No fixtures yet')
    expect(screen.getByRole('button', {name: 'Red Rockets'})).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Account menu'}))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('alex@example.com')).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', {name: 'Join a team'})).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', {name: 'Log out'}))
    const confirm = await screen.findByRole('dialog', {name: 'Log out?'})
    await user.click(within(confirm).getByRole('button', {name: 'Log out'}))
    expect(context.logout).toHaveBeenCalled()
  })

  it('toggles the colour mode', async () => {
    const season = makeSeason()
    dashboardServer([season])
    document.documentElement.dataset.theme = 'light'
    const {user} = renderScreen(<Dashboard />, {path: '/fixtures', context: {season}})
    await screen.findByText('No fixtures yet')
    await user.click(screen.getByRole('button', {name: 'Toggle colour mode'}))
    expect(document.documentElement.dataset.theme).toBe('dark')
    await user.click(screen.getByRole('button', {name: 'Toggle colour mode'}))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('gives admins every section, lazy pages and the season switcher', async () => {
    const season = makeSeason({name: 'Winter 2026'})
    const hidden = makeSeason({name: 'Secret 2027', isHidden: true})
    dashboardServer([season, hidden])
    const {user, context} = renderScreen(<Dashboard />, {
      path: '/spirit',
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    expect(tabNames()).toEqual(['Ladder', 'Fixtures', 'Reports', 'Spirit', 'MVP', 'Teams', 'Users', 'Port'])
    expect(await screen.findByText('No teams this season.', {}, {timeout: 3000})).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Season: Winter 2026'}))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Hidden')).toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitemradio', {name: /Secret 2027/}))
    expect(context.seasonSet).toHaveBeenCalledWith(hidden)

    await user.click(screen.getByRole('button', {name: 'Season: Winter 2026'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Create new season'}))
    expect(await screen.findByRole('dialog', {name: /season/i})).toBeInTheDocument()
  })

  it('hides hidden seasons from players with several seasons', async () => {
    const season = makeSeason({name: 'Winter 2026'})
    const old = makeSeason({name: 'Summer 2025'})
    const hidden = makeSeason({name: 'Secret 2027', isHidden: true})
    dashboardServer([season, old, hidden])
    const {user} = renderScreen(<Dashboard />, {path: '/fixtures', context: {season}})
    const switcher = await screen.findByRole('button', {name: 'Season: Winter 2026'})
    await user.click(switcher)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitemradio', {name: /Summer 2025/})).toBeInTheDocument()
    expect(within(menu).queryByText('Secret 2027')).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', {name: 'Create new season'})).not.toBeInTheDocument()
  })
})

describe('Dashboard navigation for team members', () => {
  it('opens the report and settings dialogs and navigates via the section menu', async () => {
    const season = makeSeason()
    const team = makeTeam({seasonId: season.id, name: 'Red Rockets'})
    mockServer({
      '/SeasonList': () => [season],
      '/FeatureCompetitionLoad': () => ({teams: [], fixtures: []}),
      '/FeatureReportEditorLoad': () => ({fixtures: [], teams: [], againstOptions: []}),
      '/MemberListOfTeam': () => ({members: [], users: []}),
    })
    const {user} = renderScreen(<Dashboard />, {
      path: '/ladder',
      auth: makeAuth({team}),
      context: {season},
    })
    expect(await screen.findByText('No ladder yet')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Report score'}))
    expect(await screen.findByRole('dialog', {name: 'Report score'})).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', {name: 'Red Rockets'}))
    expect(await screen.findByRole('dialog', {name: 'Settings'})).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // The compact section menu used on phones.
    await user.click(screen.getByRole('button', {name: 'Ladder'}))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', {name: 'Fixtures'}))
    expect(window.location.pathname).toBe('/fixtures')
  })
})
