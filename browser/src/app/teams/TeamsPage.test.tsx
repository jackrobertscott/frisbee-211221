import {TTeam} from '@shared/schemas/ioTeam'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {TEAM_COLORS} from '../../utils/colors'
import {pickOption, renderScreen} from '../common/screenTesting'
import {TeamsPage} from './TeamsPage'

type TListPayload = {
  seasonId: string
  search?: string
  sortBy?: string
  sortDirection?: string
  skip?: number
  limit?: number
}

const setup = () => {
  const season = makeSeason({name: 'Winter 2026'})
  const teams: TTeam[] = [
    makeTeam({seasonId: season.id, name: 'Red Rockets', division: 1, phone: '0400 000 001', email: 'red@example.com'}),
    makeTeam({seasonId: season.id, name: 'Blue Bolts'}),
  ]
  return {season, teams}
}

const lastPayload = (server: ReturnType<typeof mockServer>) => {
  const payloads = server.payloads('/FeatureDashboardTeamsLoad') as TListPayload[]
  return payloads[payloads.length - 1]
}

describe('TeamsPage', () => {
  it('loads teams with server-side sorting and paging params', async () => {
    const {season, teams} = setup()
    const server = mockServer({
      '/FeatureDashboardTeamsLoad': () => ({count: 60, teams}),
    })
    const {user} = renderScreen(<TeamsPage />, {context: {season}})
    const table = screen.getByRole('table', {name: 'Teams'})
    expect(table).toHaveAttribute('aria-busy', 'true')
    expect(await within(table).findByText('Red Rockets')).toBeInTheDocument()
    expect(within(table).getByText('Division 1')).toBeInTheDocument()
    expect(within(table).getByText('Unassigned')).toBeInTheDocument()
    expect(server.payloads('/FeatureDashboardTeamsLoad')).toEqual([
      {seasonId: season.id, search: '', sortBy: 'division', sortDirection: 'asc', skip: 0, limit: 25},
    ])
    // Players can't create teams.
    expect(screen.queryByRole('button', {name: 'Create team'})).not.toBeInTheDocument()

    await user.click(within(table).getByRole('button', {name: 'Team'}))
    await waitFor(() => expect(lastPayload(server)).toMatchObject({sortBy: 'name', sortDirection: 'asc'}))
    await user.click(within(table).getByRole('button', {name: 'Team'}))
    await waitFor(() => expect(lastPayload(server)).toMatchObject({sortBy: 'name', sortDirection: 'desc'}))
    expect(within(table).getByRole('columnheader', {name: /Team/})).toHaveAttribute('aria-sort', 'descending')
    // Newest first is the natural default for dates.
    await user.click(within(table).getByRole('button', {name: 'Created'}))
    await waitFor(() =>
      expect(lastPayload(server)).toMatchObject({sortBy: 'createdOn', sortDirection: 'desc'}),
    )

    await user.click(screen.getByRole('button', {name: 'Next page'}))
    await waitFor(() => expect(lastPayload(server)).toMatchObject({skip: 25, limit: 25}))
    await pickOption(user, screen.getByRole('combobox', {name: 'Rows per page'}), '50')
    await waitFor(() => expect(lastPayload(server)).toMatchObject({skip: 0, limit: 50}))
  })

  it('searches on the server and resets to the first page', async () => {
    const {season, teams} = setup()
    const server = mockServer({
      '/FeatureDashboardTeamsLoad': (payload) => {
        const {search} = payload as TListPayload
        return search ? {count: 0, teams: []} : {count: 60, teams}
      },
    })
    const {user} = renderScreen(<TeamsPage />, {context: {season}})
    await screen.findByText('Red Rockets')
    await user.click(screen.getByRole('button', {name: 'Next page'}))
    await waitFor(() => expect(lastPayload(server)).toMatchObject({skip: 25}))
    await user.type(screen.getByPlaceholderText('Search teams'), 'zebra')
    await waitFor(() => expect(lastPayload(server)).toMatchObject({search: 'zebra', skip: 0}))
    expect(await screen.findByText('No matching teams')).toBeInTheDocument()
    expect(screen.getByText('Try another name.')).toBeInTheDocument()
  })

  it('shows the empty state when the season has no teams', async () => {
    const {season} = setup()
    mockServer({'/FeatureDashboardTeamsLoad': () => ({count: 0, teams: []})})
    renderScreen(<TeamsPage />, {context: {season}})
    expect(await screen.findByText('No teams yet')).toBeInTheDocument()
  })

  it('opens a read-only team card for players', async () => {
    const {season, teams} = setup()
    mockServer({'/FeatureDashboardTeamsLoad': () => ({count: 2, teams})})
    const {user} = renderScreen(<TeamsPage />, {
      auth: makeAuth(),
      context: {season},
    })
    await user.click(await screen.findByText('Red Rockets'))
    const dialog = await screen.findByRole('dialog', {name: 'Red Rockets'})
    expect(within(dialog).getByText('red@example.com')).toBeInTheDocument()
    expect(within(dialog).getByText('0400 000 001')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', {name: 'Delete'})).not.toBeInTheDocument()
    // Footer button (the header × shares the name).
    await user.click(within(dialog).getAllByRole('button', {name: 'Close'})[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets admins create a team and opens it afterwards', async () => {
    const {season, teams} = setup()
    const created = makeTeam({seasonId: season.id, name: 'Green Giants', color: TEAM_COLORS[0], division: 2})
    const server = mockServer({
      '/FeatureDashboardTeamsLoad': () => ({count: 2, teams}),
      '/TeamCreate': () => created,
    })
    const {user} = renderScreen(<TeamsPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    await screen.findByText('Red Rockets')
    await user.click(screen.getByRole('button', {name: 'Create team'}))
    const dialog = await screen.findByRole('dialog', {name: 'New team'})
    expect(dialog).toHaveAccessibleDescription('Adds a team to Winter 2026.')
    await user.click(within(dialog).getByRole('button', {name: 'Create team'}))
    expect(within(dialog).getByText('Give the team a name.')).toBeInTheDocument()
    expect(server.payloads('/TeamCreate')).toHaveLength(0)

    await user.type(within(dialog).getByRole('textbox', {name: 'Team name'}), 'Green Giants')
    await user.type(within(dialog).getByRole('textbox', {name: /Public email/}), 'not-an-email')
    await user.click(within(dialog).getByRole('button', {name: 'Create team'}))
    expect(within(dialog).getByText('Enter a valid email address.')).toBeInTheDocument()
    await user.clear(within(dialog).getByRole('textbox', {name: /Public email/}))
    await user.type(within(dialog).getByRole('spinbutton', {name: /Division/}), '2')
    await user.tab()
    await user.click(within(dialog).getByRole('radio', {name: 'Colour 2'}))
    await user.click(within(dialog).getByRole('button', {name: 'Create team'}))

    expect(await screen.findByText('Green Giants created.')).toBeInTheDocument()
    expect(server.payloads('/TeamCreate')).toEqual([
      {seasonId: season.id, name: 'Green Giants', color: TEAM_COLORS[1], phone: '', email: '', division: 2},
    ])
    // The new team opens in the admin dialog and the list reloads.
    expect(await screen.findByRole('dialog', {name: 'Green Giants'})).toBeInTheDocument()
    await waitFor(() => expect(server.payloads('/FeatureDashboardTeamsLoad')).toHaveLength(2))
  })

  it('lets admins edit and delete a team from the list', async () => {
    const {season, teams} = setup()
    const [red] = teams
    const server = mockServer({
      '/FeatureDashboardTeamsLoad': () => ({count: 2, teams}),
      '/TeamUpdate': (payload) => ({...red, ...(payload as object)}),
      '/TeamDelete': () => undefined,
    })
    const {user} = renderScreen(<TeamsPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    await user.click(await screen.findByText('Red Rockets'))
    const dialog = await screen.findByRole('dialog', {name: 'Red Rockets'})
    const name = within(dialog).getByRole('textbox', {name: 'Team name'})
    await user.clear(name)
    await user.type(name, 'Red Rocketeers')
    await user.click(within(dialog).getByRole('button', {name: 'Save changes'}))
    expect(await screen.findByText('Team saved.')).toBeInTheDocument()
    // The open dialog follows the saved team and the list reloads.
    expect(await screen.findByRole('dialog', {name: 'Red Rocketeers'})).toBeInTheDocument()
    await waitFor(() => expect(server.payloads('/FeatureDashboardTeamsLoad')).toHaveLength(2))

    await user.click(screen.getByRole('button', {name: 'Delete'}))
    const confirm = await screen.findByRole('dialog', {name: 'Delete Red Rocketeers?'})
    await user.click(within(confirm).getByRole('button', {name: 'Delete team'}))
    expect(await screen.findByText('Red Rocketeers deleted.')).toBeInTheDocument()
    await waitFor(() => expect(server.payloads('/FeatureDashboardTeamsLoad')).toHaveLength(3))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
