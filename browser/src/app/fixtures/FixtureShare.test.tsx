import {TFixture} from '@shared/schemas/ioFixture'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeTeam, testId} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {renderScreen} from '../common/screenTesting'
import {FixtureShare} from './FixtureShare'

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
    title: 'Round 5',
    date: '2026-04-04T00:00:00.000Z',
    games: [
      {id: testId(), team1Id: green.id, team2Id: gold.id, time: '7pm', place: 'Field 1'},
      {id: testId(), team1Id: red.id, team2Id: blue.id, time: '6pm', place: 'Field 2'},
      {id: testId(), team1Id: blue.id, team2Id: gold.id, time: '6pm', place: 'Field 1'},
    ],
  }
  return {fixture, teams: [red, blue, green, gold]}
}

describe('FixtureShare', () => {
  it('shows the fixture games ordered by time then place', async () => {
    const {fixture, teams} = setup()
    const server = mockServer({'/FeatureFixtureViewLoad': () => ({fixture, teams})})
    renderScreen(<FixtureShare fixtureId={fixture.id} />, {shell: false})
    expect(screen.getByRole('button', {name: 'Print'})).toBeDisabled()
    expect(await screen.findByRole('heading', {name: 'Round 5'})).toBeInTheDocument()
    expect(server.payloads('/FeatureFixtureViewLoad')).toEqual([{fixtureId: fixture.id}])
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows[1]).toHaveTextContent(/6pm.*Field 1.*Blue Bolts.*Gold Geese/)
    expect(rows[2]).toHaveTextContent(/6pm.*Field 2.*Red Rockets.*Blue Bolts/)
    expect(rows[3]).toHaveTextContent(/7pm.*Field 1.*Green Giants/)
    expect(screen.getByRole('button', {name: 'Print'})).toBeEnabled()
  })

  it('prints and copies the link', async () => {
    const {fixture, teams} = setup()
    mockServer({'/FeatureFixtureViewLoad': () => ({fixture, teams})})
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const {user} = renderScreen(<FixtureShare fixtureId={fixture.id} />, {shell: false})
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true})
    await screen.findByRole('heading', {name: 'Round 5'})
    await user.click(screen.getByRole('button', {name: 'Print'}))
    expect(print).toHaveBeenCalled()
    await user.click(screen.getByRole('button', {name: 'Copy link'}))
    expect(await screen.findByText('Could not copy the link')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(window.location.href)
  })

  it('explains when the fixture no longer exists', async () => {
    mockServer({
      '/FeatureFixtureViewLoad': () => {
        throw serverError(404, 'Fixture not found.', 'db.record_not_found')
      },
    })
    const pushState = vi.spyOn(window.history, 'pushState')
    const {user} = renderScreen(<FixtureShare fixtureId={testId()} />, {shell: false})
    expect(await screen.findByText('Fixture not found')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'See all fixtures'}))
    await waitFor(() => expect(window.location.pathname).toBe('/fixtures'))
    expect(pushState).toHaveBeenCalled()
  })
})
