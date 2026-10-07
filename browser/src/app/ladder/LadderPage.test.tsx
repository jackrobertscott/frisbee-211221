import {TFixture} from '@shared/schemas/ioFixture'
import {TSeason} from '@shared/schemas/ioSeason'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeSeason, makeTeam, testId} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {renderScreen} from '../common/screenTesting'
import {LadderPage} from './LadderPage'

const NOW = '2026-01-01T00:00:00.000Z'

const setup = (patch: Partial<TSeason> = {}) => {
  const season = makeSeason({name: 'Winter 2026', ...patch})
  const red = makeTeam({seasonId: season.id, name: 'Red Rockets', division: 1})
  const blue = makeTeam({seasonId: season.id, name: 'Blue Bolts', division: 1})
  const green = makeTeam({seasonId: season.id, name: 'Green Giants', division: 2})
  const loose = makeTeam({seasonId: season.id, name: 'Loose Units'})
  const fixture: TFixture = {
    id: testId(),
    createdOn: NOW,
    updatedOn: NOW,
    seasonId: season.id,
    userId: testId(),
    title: 'Round 1',
    date: '2026-02-01T00:00:00.000Z',
    games: [
      {id: testId(), team1Id: blue.id, team2Id: red.id, time: '6pm', place: 'F1', team1Score: 13, team2Score: 7},
    ],
  }
  const empty: TFixture = {...fixture, id: testId(), title: 'Round 2', games: []}
  return {season, teams: [red, blue, green, loose], red, blue, green, fixture, empty}
}

describe('LadderPage', () => {
  it('ranks teams per division from the scored games', async () => {
    const {season, teams, fixture, empty} = setup()
    const server = mockServer({
      '/FeatureCompetitionLoad': () => ({teams, fixtures: [fixture, empty]}),
    })
    const {user} = renderScreen(<LadderPage />, {context: {season}})
    expect(screen.getByRole('status', {name: 'Loading the ladder'})).toBeInTheDocument()
    expect(await screen.findByText('Division 1')).toBeInTheDocument()
    expect(server.payloads('/FeatureCompetitionLoad')).toEqual([{seasonId: season.id}])
    expect(screen.getByText('Division 2')).toBeInTheDocument()
    expect(screen.getByText('No division')).toBeInTheDocument()

    const [div1] = screen.getAllByRole('table')
    const rows = within(div1).getAllByRole('row')
    // Winner first with 4 points.
    expect(rows[1]).toHaveTextContent('Blue Bolts')
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('4')
    expect(rows[2]).toHaveTextContent('Red Rockets')

    expect(screen.getByRole('img', {name: 'Occurrences of each points total scored'})).toBeInTheDocument()
    // Results by round expand on demand.
    await user.click(screen.getByRole('button', {name: /^Round 1/}))
    const results = screen.getByRole('table', {name: 'Round 1 results'})
    expect(within(results).getAllByRole('columnheader', {name: 'Score'})).toHaveLength(1)
    expect(within(results).getAllByRole('row')[1]).toHaveTextContent(/Blue Bolts.*13–7.*Red Rockets/)
    await user.click(screen.getByRole('button', {name: /^Round 2/}))
    expect(screen.getByText('No games in this round.')).toBeInTheDocument()
    // Visitors don't get admin actions.
    expect(screen.queryByRole('button', {name: 'Edit final results'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Edit results'})).not.toBeInTheDocument()
  })

  it('shows final results by division when the season has them', async () => {
    const {teams, red, blue, green} = setup()
    const season = makeSeason({
      finalResults: [
        {teamId: blue.id, position: 2},
        {teamId: red.id, position: 1},
        {teamId: green.id, position: 4},
      ],
    })
    mockServer({'/FeatureCompetitionLoad': () => ({teams, fixtures: []})})
    renderScreen(<LadderPage />, {context: {season}})
    expect(await screen.findByText('Final results')).toBeInTheDocument()
    expect(screen.getByLabelText('Position 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Position 4')).toHaveTextContent('4')
    expect(screen.getByText('No scores recorded yet.')).toBeInTheDocument()
  })

  it('shows an empty ladder and a retry when loading fails', async () => {
    const {season} = setup()
    let fail = true
    mockServer({
      '/FeatureCompetitionLoad': () => {
        if (fail) throw serverError(500, 'Down')
        return {teams: [], fixtures: []}
      },
    })
    const {user} = renderScreen(<LadderPage />, {context: {season}})
    expect(await screen.findByText('Couldn’t load the ladder')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', {name: 'Try again'}))
    expect(await screen.findByText('No ladder yet')).toBeInTheDocument()
  })

  it('lets admins edit final results and fixture results', async () => {
    const {season, teams, red, fixture} = setup()
    const server = mockServer({
      '/FeatureCompetitionLoad': () => ({teams, fixtures: [fixture]}),
      '/SeasonUpdate': (payload) => ({...season, ...(payload as object)}),
      '/FeatureFixtureTallyLoad': () => ({fixture, teams, reports: []}),
    })
    const {user, context} = renderScreen(<LadderPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    await user.click(await screen.findByRole('button', {name: 'Edit final results'}))
    const finals = await screen.findByRole('dialog', {name: 'Final results'})
    expect(within(finals).getByText('Division 2')).toBeInTheDocument()
    await user.type(within(finals).getByRole('spinbutton', {name: 'Red Rockets position'}), '1')
    await user.tab()
    await user.click(within(finals).getByRole('button', {name: 'Save results'}))
    expect(await screen.findByText('Final results saved')).toBeInTheDocument()
    expect(server.payloads('/SeasonUpdate')).toEqual([
      {
        seasonId: season.id,
        name: season.name,
        signUpOpen: season.signUpOpen,
        finalResults: [{teamId: red.id, position: 1}],
      },
    ])
    expect(context.seasonSet).toHaveBeenCalledWith(
      expect.objectContaining({finalResults: [{teamId: red.id, position: 1}]}),
      true,
    )

    await user.click(screen.getByRole('button', {name: 'Edit results'}))
    expect(await screen.findByRole('dialog', {name: 'Round 1 results'})).toBeInTheDocument()
    await waitFor(() => expect(server.payloads('/FeatureFixtureTallyLoad')).toEqual([{fixtureId: fixture.id}]))
  })
})
