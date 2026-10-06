import {screen, waitFor, within} from '@testing-library/react'
import {beforeEach, describe, expect, it} from 'vitest'
import {makeAuth, makeSeason, testId} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError} from '../../test/server'
import {setupUser, spyToasts} from '../seasons/screenTestUtils'
import {MvpPage} from './MvpPage'

const admin = () => makeAuth({user: {admin: true}})

beforeEach(() => {
  window.history.replaceState(null, '', '/mvp')
})

describe('MvpPage', () => {
  it('lists MVP points per gender matching slot', async () => {
    const season = makeSeason({genderDivision: 'mixed'})
    const server = mockServer({
      '/FeatureDashboardMvpLoad': () => ({
        rows: [
          {userId: testId(), userName: 'Jo Female', votes: 4, genderMatching: 'female'},
          {userId: testId(), userName: 'Sam Male', votes: 2, genderMatching: 'male'},
        ],
      }),
    })
    renderApp(<MvpPage />, {
      auth: admin(),
      context: {season},
    })
    expect(await screen.findByText('Jo Female')).toBeInTheDocument()
    expect(screen.getByText('Sam Male')).toBeInTheDocument()
    expect(screen.getByText('Female MVP points')).toBeInTheDocument()
    expect(server.payloads('/FeatureDashboardMvpLoad')).toEqual([
      {seasonId: season.id},
    ])
  })

  it('shows team, division and points in server order', async () => {
    mockServer({
      '/FeatureDashboardMvpLoad': () => ({
        rows: [
          {
            userId: testId(),
            userName: 'Top Player',
            votes: 9,
            genderMatching: 'male',
            teamName: 'Hucks',
            division: 1,
          },
          {userId: testId(), userName: 'Free Agent', votes: 3, genderMatching: 'male'},
        ],
      }),
    })
    renderApp(<MvpPage />, {auth: admin(), context: {season: makeSeason({genderDivision: 'men'})}})
    const table = await screen.findByRole('table', {name: 'Male MVP points'})
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual(['Top Player1Hucks9', 'Free Agent——3'])
    expect(screen.getByText('2 players with votes')).toBeInTheDocument()
    expect(screen.queryByText('Female MVP points')).not.toBeInTheDocument()
  })

  it('explains official scoring points and shows empty tables', async () => {
    mockServer({'/FeatureDashboardMvpLoad': () => ({rows: []})})
    renderApp(<MvpPage />, {
      auth: admin(),
      context: {season: makeSeason({genderDivision: 'women', useOfficialScoring: true})},
    })
    expect(await screen.findByText('No votes yet.')).toBeInTheDocument()
    expect(screen.getByText(/MVP 1st place =/)).toHaveTextContent(
      'MVP 1st place = 5 points · MVP 2nd place = 3 points',
    )
    expect(screen.getByText('0 players with votes')).toBeInTheDocument()
    expect(screen.queryByText('Male MVP points')).not.toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const server = mockServer({
      '/FeatureDashboardMvpLoad': () => {
        throw serverError(500, 'Down')
      },
    })
    renderApp(<MvpPage />, {auth: admin(), context: {season: makeSeason()}})
    expect(screen.getByRole('status', {name: 'Loading MVP points'})).toBeInTheDocument()
    expect(await screen.findByText('Couldn’t load this')).toBeInTheDocument()
    expect(toasts.error).toHaveBeenCalled()
    server.on('/FeatureDashboardMvpLoad', () => ({rows: []}))
    await user.click(screen.getByRole('button', {name: 'Try again'}))
    expect(await screen.findAllByText('No votes yet.')).not.toHaveLength(0)
  })

  it('sends non-admins home without loading', async () => {
    const server = mockServer()
    renderApp(<MvpPage />, {auth: makeAuth(), context: {season: makeSeason()}})
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(server.calls).toHaveLength(0)
  })
})
