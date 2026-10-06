import {TFeatureSpiritRow} from '@shared/endpoints/FeatureDef'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {renderScreen} from '../common/screenTesting'
import {SpiritPage} from './SpiritPage'

type TSpiritPayload = {seasonId: string; sortBy?: string; sortDirection?: string}

const row = (name: string, patch: Partial<TFeatureSpiritRow> = {}): TFeatureSpiritRow => ({
  team: makeTeam({name, division: 1}),
  receivedSpirit: 30,
  receivedReports: 10,
  receivedAverage: 3,
  adjustedReceivedAverage: 3.123,
  allocatedSpirit: 28,
  allocatedReports: 10,
  allocatedAverage: 2.8,
  adjustedAllocatedAverage: 2.75,
  averageDifference: 0.2,
  adjustedDifference: 0.001,
  ...patch,
})

const lastPayload = (server: ReturnType<typeof mockServer>) => {
  const payloads = server.payloads('/FeatureDashboardSpiritLoad') as TSpiritPayload[]
  return payloads[payloads.length - 1]
}

describe('SpiritPage', () => {
  it('loads spirit scores sorted on the server and re-sorts by column', async () => {
    const season = makeSeason({useOfficialScoring: true})
    const server = mockServer({
      '/FeatureDashboardSpiritLoad': () => ({
        rows: [row('Red Rockets', {averageDifference: 1.5}), row('Blue Bolts', {averageDifference: -2})],
      }),
    })
    const {user} = renderScreen(<SpiritPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    expect(screen.getByRole('status', {name: 'Loading spirit scores'})).toBeInTheDocument()
    const table = await screen.findByRole('table', {name: 'Team spirit scores'})
    expect(within(table).getByText('Red Rockets')).toBeInTheDocument()
    expect(screen.getByText('Official scoring · five categories, 0–20 per game')).toBeInTheDocument()
    expect(within(table).getAllByText('3.12')).toHaveLength(2)
    // Differences above a point are badged; tiny values show as 0.
    expect(within(table).getByText('+1.5')).toBeInTheDocument()
    expect(within(table).getByText('-2')).toBeInTheDocument()
    expect(within(table).getAllByText('0')).toHaveLength(2)
    expect(server.payloads('/FeatureDashboardSpiritLoad')).toEqual([
      {seasonId: season.id, sortBy: 'adjustedReceivedAverage', sortDirection: 'desc'},
    ])

    await user.click(within(table).getByRole('button', {name: 'Adj got'}))
    await waitFor(() =>
      expect(lastPayload(server)).toEqual({seasonId: season.id, sortBy: 'adjustedReceivedAverage', sortDirection: 'asc'}),
    )
    await user.click(within(table).getByRole('button', {name: 'Team'}))
    await waitFor(() => expect(lastPayload(server)).toMatchObject({sortBy: 'team', sortDirection: 'asc'}))
    await user.click(within(table).getByRole('button', {name: 'Team'}))
    await waitFor(() => expect(lastPayload(server)).toMatchObject({sortBy: 'team', sortDirection: 'desc'}))
    await user.click(within(table).getByRole('button', {name: 'Avg diff'}))
    await waitFor(() =>
      expect(lastPayload(server)).toMatchObject({sortBy: 'averageDifference', sortDirection: 'desc'}),
    )
  })

  it('shows simple scoring and an empty season', async () => {
    const season = makeSeason()
    mockServer({'/FeatureDashboardSpiritLoad': () => ({rows: []})})
    renderScreen(<SpiritPage />, {auth: makeAuth({user: {admin: true}}), context: {season}})
    expect(await screen.findByText('No teams this season.')).toBeInTheDocument()
    expect(screen.getByText('Simple scoring · 0–4 per game')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    const season = makeSeason()
    let fail = true
    mockServer({
      '/FeatureDashboardSpiritLoad': () => {
        if (fail) throw serverError(500, 'Down')
        return {rows: [row('Red Rockets')]}
      },
    })
    const {user} = renderScreen(<SpiritPage />, {
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    expect(await screen.findByText('Couldn’t load this')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', {name: 'Try again'}))
    expect(await screen.findByText('Red Rockets')).toBeInTheDocument()
  })

  it('sends non-admins back home without loading anything', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    const server = mockServer()
    renderScreen(<SpiritPage />, {auth: makeAuth(), context: {season: makeSeason()}})
    await waitFor(() => expect(pushState).toHaveBeenCalled())
    expect(window.location.pathname).toBe('/')
    expect(server.calls).toHaveLength(0)
  })
})
