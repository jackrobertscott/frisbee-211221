import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeTeam, testId} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {renderScreen, userError} from '../common/screenTesting'
import {reportedScores, TallyDialog} from './TallyDialog'

const NOW = '2026-01-01T00:00:00.000Z'

const setup = () => {
  const red = makeTeam({name: 'Red Rockets'})
  const blue = makeTeam({name: 'Blue Bolts'})
  const green = makeTeam({name: 'Green Giants'})
  const gold = makeTeam({name: 'Gold Geese'})
  const fixture: TFixture = {
    id: testId(),
    createdOn: NOW,
    updatedOn: NOW,
    seasonId: testId(),
    userId: testId(),
    title: 'Round 4',
    date: '2026-02-01T00:00:00.000Z',
    grading: false,
    games: [
      {id: testId(), team1Id: red.id, team2Id: blue.id, time: '6pm', place: 'F1'},
      {id: testId(), team1Id: green.id, team2Id: gold.id, time: '7pm', place: 'F2', team1Score: 11, team2Score: 11},
    ],
  }
  const report = (teamId: string, teamAgainstId: string, scoreFor: number, scoreAgainst: number): TReport => ({
    id: testId(),
    createdOn: NOW,
    updatedOn: NOW,
    teamId,
    teamAgainstId,
    fixtureId: fixture.id,
    scoreFor,
    scoreAgainst,
    spiritComment: '',
  })
  return {red, blue, green, gold, fixture, report}
}

describe('reportedScores', () => {
  it('averages both sides, or uses whichever team reported', () => {
    const {red, blue, fixture, report} = setup()
    const game = fixture.games[0]
    expect(reportedScores([], game)).toBeUndefined()
    expect(reportedScores([report(red.id, blue.id, 13, 9)], game)).toEqual({team1: 13, team2: 9})
    expect(reportedScores([report(blue.id, red.id, 9, 12)], game)).toEqual({team1: 12, team2: 9})
    expect(
      reportedScores([report(red.id, blue.id, 13, 9), report(blue.id, red.id, 10, 12)], game),
    ).toEqual({team1: 13, team2: 10})
  })
})

describe('TallyDialog', () => {
  it('prefills reported scores, flags differences and saves the results', async () => {
    const {red, blue, green, gold, fixture, report} = setup()
    const reports = [report(red.id, blue.id, 13, 9), report(green.id, gold.id, 12, 10)]
    const server = mockServer({
      '/FeatureFixtureTallyLoad': () => ({fixture, teams: [red, blue, green, gold], reports}),
      '/FixtureUpdate': () => fixture,
    })
    const onSaved = vi.fn()
    const {user} = renderScreen(
      <TallyDialog fixture={fixture} onClose={vi.fn()} onSaved={onSaved} />,
      {auth: makeAuth({user: {admin: true}})},
    )
    const dialog = screen.getByRole('dialog', {name: 'Round 4 results'})
    expect(within(dialog).getByRole('button', {name: 'Save results'})).toBeDisabled()
    expect(await within(dialog).findByRole('spinbutton', {name: 'Red Rockets score'})).toHaveValue('13')
    expect(within(dialog).getByRole('spinbutton', {name: 'Blue Bolts score'})).toHaveValue('9')
    // Existing scores are kept even when reports disagree.
    expect(within(dialog).getByRole('spinbutton', {name: 'Green Giants score'})).toHaveValue('11')
    expect(within(dialog).getByText('Highlighted scores differ from what the teams reported.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Doesn’t match the recorded result')).toBeInTheDocument()
    // Blue and Gold have not reported.
    expect(within(dialog).getByText('Blue Bolts', {selector: '.ui-badge *, .ui-badge'})).toBeInTheDocument()

    const greenScore = within(dialog).getByRole('spinbutton', {name: 'Green Giants score'})
    await user.clear(greenScore)
    await user.type(greenScore, '12')
    const goldScore = within(dialog).getByRole('spinbutton', {name: 'Gold Geese score'})
    await user.clear(goldScore)
    await user.type(goldScore, '10{Enter}')
    await waitFor(() =>
      expect(within(dialog).queryByText('Highlighted scores differ from what the teams reported.')).not.toBeInTheDocument(),
    )

    await user.click(within(dialog).getByRole('button', {name: 'Save results'}))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(await screen.findByText('Round 4 results saved')).toBeInTheDocument()
    expect(server.payloads('/FixtureUpdate')).toEqual([
      {
        fixtureId: fixture.id,
        title: 'Round 4',
        date: fixture.date,
        grading: false,
        games: [
          {...fixture.games[0], team1Score: 13, team2Score: 9},
          {...fixture.games[1], team1Score: 12, team2Score: 10},
        ],
      },
    ])
  })

  it('celebrates when every team reported and handles fixtures without games', async () => {
    const {red, blue, fixture, report} = setup()
    const oneGame = {...fixture, games: [fixture.games[0]]}
    mockServer({
      '/FeatureFixtureTallyLoad': () => ({
        fixture: oneGame,
        teams: [red, blue],
        reports: [report(red.id, blue.id, 13, 9), report(blue.id, red.id, 9, 13)],
      }),
    })
    const first = renderScreen(<TallyDialog fixture={oneGame} onClose={vi.fn()} onSaved={vi.fn()} />, {
      auth: makeAuth({user: {admin: true}}),
    })
    expect(await screen.findByText('All teams have submitted reports')).toBeInTheDocument()
    first.unmount()

    const noGames = {...fixture, games: []}
    mockServer({'/FeatureFixtureTallyLoad': () => ({fixture: noGames, teams: [], reports: []})})
    renderScreen(<TallyDialog fixture={noGames} onClose={vi.fn()} onSaved={vi.fn()} />, {
      auth: makeAuth({user: {admin: true}}),
    })
    expect(await screen.findByText('This fixture has no games.')).toBeInTheDocument()
    expect(screen.getByText('No reports yet.')).toBeInTheDocument()
  })

  it('shows save errors and closes on cancel', async () => {
    const {red, blue, fixture} = setup()
    mockServer({
      '/FeatureFixtureTallyLoad': () => ({fixture, teams: [red, blue], reports: []}),
      '/FixtureUpdate': () => {
        throw userError(400, 'Scores must be whole numbers.')
      },
    })
    const onClose = vi.fn()
    const onSaved = vi.fn()
    const {user} = renderScreen(<TallyDialog fixture={fixture} onClose={onClose} onSaved={onSaved} />, {
      auth: makeAuth({user: {admin: true}}),
    })
    await screen.findByRole('spinbutton', {name: 'Red Rockets score'})
    await user.click(screen.getByRole('button', {name: 'Save results'}))
    expect(await screen.findByText('Scores must be whole numbers.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', {name: 'Cancel'}))
    expect(onClose).toHaveBeenCalled()
  })
})
