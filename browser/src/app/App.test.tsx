import {TFixture} from '@shared/schemas/ioFixture'
import {screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeSeason, makeTeam, testId} from '../test/fixtures'
import {renderApp} from '../test/render'
import {mockServer} from '../test/server'
import {App} from './App'

const NOW = '2026-01-01T00:00:00.000Z'

const appServer = () =>
  mockServer({
    '/SeasonList': () => [],
    '/FeatureCompetitionLoad': () => ({teams: [], fixtures: []}),
  })

describe('App', () => {
  it('shows a loading state until auth has loaded', () => {
    mockServer()
    renderApp(<App />, {shell: false, context: {loaded: false}})
    expect(screen.getAllByRole('status', {name: 'Loading'}).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('sends signed out visitors to sign in when there is no season', async () => {
    mockServer()
    renderApp(<App />, {shell: false, path: '/auth/welcome', context: {season: undefined}})
    expect(await screen.findByRole('heading', {name: 'Welcome'})).toBeInTheDocument()
    expect(screen.getByRole('textbox', {name: 'Email'})).toBeInTheDocument()
  })

  it('shows the dashboard to signed out visitors when a season exists', async () => {
    appServer()
    renderApp(<App />, {shell: false, path: '/fixtures', context: {season: makeSeason()}})
    expect(await screen.findByText('No fixtures yet')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Log in'})).toBeInTheDocument()
  })

  it('keeps the auth screens reachable while signed in', async () => {
    mockServer()
    renderApp(<App />, {
      shell: false,
      path: '/auth/welcome',
      auth: makeAuth(),
      context: {season: makeSeason()},
    })
    expect(await screen.findByRole('heading', {name: 'Welcome'})).toBeInTheDocument()
  })

  it('asks signed in players to come back when no season is ready', () => {
    mockServer()
    renderApp(<App />, {shell: false, auth: makeAuth(), context: {season: undefined}})
    expect(screen.getByText('Season not ready')).toBeInTheDocument()
  })

  it('lets admins start a season when none exists', () => {
    mockServer()
    renderApp(<App />, {
      shell: false,
      auth: makeAuth({user: {admin: true}}),
      context: {season: undefined},
    })
    expect(screen.getByText('Start a new season')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Create season'})).toBeInTheDocument()
  })

  it('opens the shareable fixture view from a ?fixtureId link, even when signed out', async () => {
    const red = makeTeam({name: 'Red Rockets'})
    const blue = makeTeam({name: 'Blue Bolts'})
    const fixture: TFixture = {
      id: testId(),
      createdOn: NOW,
      updatedOn: NOW,
      seasonId: testId(),
      userId: testId(),
      title: 'Round 5',
      date: '2026-04-04T00:00:00.000Z',
      games: [{id: testId(), team1Id: red.id, team2Id: blue.id, time: '6pm', place: 'Field 1'}],
    }
    const server = mockServer({
      '/FeatureFixtureViewLoad': () => ({fixture, teams: [red, blue]}),
    })
    renderApp(<App />, {
      shell: false,
      path: `/?fixtureId=${fixture.id}`,
      context: {season: undefined, loaded: false},
    })
    expect(await screen.findByRole('heading', {name: 'Round 5'})).toBeInTheDocument()
    expect(server.payloads('/FeatureFixtureViewLoad')).toEqual([{fixtureId: fixture.id}])
  })
})
