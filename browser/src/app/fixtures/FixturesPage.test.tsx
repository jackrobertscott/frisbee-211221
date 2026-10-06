import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam, testId} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {pickOption, pickToday, renderScreen} from '../common/screenTesting'
import {FixturesPage} from './FixturesPage'

const NOW = '2026-01-01T00:00:00.000Z'

const makeFixture = (patch: Partial<TFixture> = {}): TFixture => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  seasonId: testId(),
  userId: testId(),
  title: 'Round 1',
  date: '2999-03-01T00:00:00.000Z',
  games: [],
  ...patch,
})

const setup = () => {
  const season = makeSeason()
  const red = makeTeam({seasonId: season.id, name: 'Red Rockets', division: 1})
  const blue = makeTeam({seasonId: season.id, name: 'Blue Bolts', division: 1})
  const green = makeTeam({seasonId: season.id, name: 'Green Giants', division: 1})
  const gold = makeTeam({seasonId: season.id, name: 'Gold Geese', division: 1})
  const past = makeFixture({
    seasonId: season.id,
    title: 'Round 1',
    date: '2020-01-01T00:00:00.000Z',
    games: [
      {id: testId(), team1Id: red.id, team2Id: blue.id, time: '6:00pm', place: 'Field 1', team1Score: 13, team2Score: 9},
    ],
  })
  const future = makeFixture({
    seasonId: season.id,
    title: 'Round 2',
    grading: true,
    date: '2999-01-01T00:00:00.000Z',
    games: [
      {id: testId(), team1Id: green.id, team2Id: gold.id, time: '7:00pm', place: 'Field 2'},
      {id: testId(), team1Id: red.id, team2Id: blue.id, time: '6:00pm', place: 'Field 1'},
    ],
  })
  return {season, teams: [red, blue, green, gold], red, blue, past, future}
}

const competition = (teams: TTeam[], fixtures: TFixture[]) => () => ({teams, fixtures})

describe('FixturesPage', () => {
  it('shows a loading state, then fixtures with upcoming rounds expanded', async () => {
    const {season, teams, past, future} = setup()
    const server = mockServer({'/FeatureCompetitionLoad': competition(teams, [past, future])})
    renderScreen(<FixturesPage />, {context: {season}})
    expect(screen.getByRole('status', {name: 'Loading fixtures'})).toBeInTheDocument()
    expect(await screen.findByText('Round 2')).toBeInTheDocument()
    expect(server.payloads('/FeatureCompetitionLoad')).toEqual([{seasonId: season.id}])
    // Past round is collapsed, upcoming one is open and badged.
    expect(screen.getByRole('button', {name: /^Round 1/})).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', {name: /^Round 2/})).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Next up')).toBeInTheDocument()
    expect(screen.getByText('Grading')).toBeInTheDocument()
    const table = screen.getByRole('table', {name: 'Round 2 games'})
    const rows = within(table).getAllByRole('row')
    // Sorted by time slot: the 6pm game comes first.
    expect(rows[1]).toHaveTextContent('Red Rockets')
    expect(rows[2]).toHaveTextContent('Green Giants')
    // Players see no admin actions.
    expect(screen.queryByRole('button', {name: 'Magic generate'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Edit Round 2'})).not.toBeInTheDocument()
  })

  it('expands a past round to show its scores', async () => {
    const {season, teams, past, future} = setup()
    mockServer({'/FeatureCompetitionLoad': competition(teams, [past, future])})
    const {user} = renderScreen(<FixturesPage />, {context: {season}})
    await user.click(await screen.findByRole('button', {name: /^Round 1/}))
    const table = screen.getByRole('table', {name: 'Round 1 games'})
    expect(within(table).getByRole('columnheader', {name: 'Score'})).toBeInTheDocument()
    expect(within(table).getByText('13')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: /^Round 1/}))
    expect(screen.queryByRole('table', {name: 'Round 1 games'})).not.toBeInTheDocument()
  })

  it('shows an empty state for players when there is no draw', async () => {
    const {season} = setup()
    mockServer({'/FeatureCompetitionLoad': competition([], [])})
    renderScreen(<FixturesPage />, {context: {season}})
    expect(await screen.findByText('No fixtures yet')).toBeInTheDocument()
    expect(screen.getByText(/hasn’t been published yet/)).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    const {season, teams, future} = setup()
    let fail = true
    const server = mockServer({
      '/FeatureCompetitionLoad': () => {
        if (fail) throw serverError(500, 'Boom')
        return {teams, fixtures: [future]}
      },
    })
    const {user} = renderScreen(<FixturesPage />, {context: {season}})
    expect(await screen.findByText('Couldn’t load this')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', {name: 'Try again'}))
    expect(await screen.findByText('Round 2')).toBeInTheDocument()
    expect(server.payloads('/FeatureCompetitionLoad')).toHaveLength(2)
  })

  it('copies a share link from the share menu', async () => {
    const {season, teams, future} = setup()
    mockServer({'/FeatureCompetitionLoad': competition(teams, [future])})
    const {user} = renderScreen(<FixturesPage />, {context: {season}})
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true})
    await user.click(await screen.findByRole('button', {name: 'Share Round 2'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Copy link'}))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/?fixtureId=${future.id}`,
      ),
    )
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('lets admins open the add, edit, generate and adjust dialogs', async () => {
    const {season, teams, future} = setup()
    mockServer({'/FeatureCompetitionLoad': competition(teams, [future])})
    const {user} = renderScreen(<FixturesPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    await screen.findByText('Round 2')

    await user.click(screen.getByRole('button', {name: 'Add fixture'}))
    expect(await screen.findByRole('dialog', {name: 'Add fixture'})).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Cancel'}))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', {name: 'Edit Round 2'}))
    const edit = await screen.findByRole('dialog', {name: 'Edit fixture'})
    expect(within(edit).getByDisplayValue('Round 2')).toBeInTheDocument()
    await user.click(within(edit).getByRole('button', {name: 'Cancel'}))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', {name: 'Magic generate'}))
    expect(await screen.findByRole('dialog', {name: 'Generate fixtures'})).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Cancel'}))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', {name: 'Adjust fixtures'}))
    expect(await screen.findByRole('dialog', {name: 'Adjust fixtures'})).toBeInTheDocument()
  })

  it('reloads the list after an admin adds a fixture', async () => {
    const {season, teams} = setup()
    const server = mockServer({'/FeatureCompetitionLoad': competition(teams, [])})
    const {user} = renderScreen(<FixturesPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    expect(await screen.findByText('No fixtures yet')).toBeInTheDocument()
    expect(screen.getByText(/Generate a full round robin/)).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Adjust fixtures'})).toBeDisabled()
    await user.click(screen.getByRole('button', {name: 'Add fixture'}))
    const dialog = await screen.findByRole('dialog', {name: 'Add fixture'})
    // Remove the blank game rows so only title and date are required.
    await user.click(within(dialog).getByRole('button', {name: 'Remove game 2'}))
    await user.click(within(dialog).getByRole('button', {name: 'Remove game 1'}))
    await user.type(within(dialog).getByPlaceholderText('Round 1'), 'Round 9')
    await pickToday(user, within(dialog).getByRole('button', {name: /^Date/}))
    const created = makeFixture({seasonId: season.id, title: 'Round 9'})
    server.on('/FixtureCreate', () => created)
    server.on('/FeatureCompetitionLoad', competition(teams, [created]))
    await user.click(within(dialog).getByRole('button', {name: 'Add fixture'}))
    expect(await screen.findByText('Round 9 added')).toBeInTheDocument()
    expect(await screen.findByRole('button', {name: /^Round 9/})).toBeInTheDocument()
    expect(server.payloads('/FeatureCompetitionLoad')).toHaveLength(2)
  })

  it('reloads the list after an admin adjusts fixtures', async () => {
    const {season, teams, future} = setup()
    const server = mockServer({
      '/FeatureCompetitionLoad': competition(teams, [future]),
      '/FixtureAdjustMultiple': () => ({count: 0}),
    })
    const {user} = renderScreen(<FixturesPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    await user.click(await screen.findByRole('button', {name: 'Adjust fixtures'}))
    const dialog = await screen.findByRole('dialog', {name: 'Adjust fixtures'})
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'After and including'}), /Round 2/)
    await user.click(within(dialog).getByRole('button', {name: 'Adjust fixtures'}))
    await waitFor(() => expect(server.payloads('/FeatureCompetitionLoad')).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Nothing moved, so no success toast.
    expect(screen.queryByText(/Successfully adjusted/)).not.toBeInTheDocument()
  })
})
