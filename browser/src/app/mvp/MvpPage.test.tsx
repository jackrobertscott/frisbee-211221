import {screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeSeason, testId} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer} from '../../test/server'
import {MvpPage} from './MvpPage'

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
      auth: makeAuth({user: {admin: true}}),
      context: {season},
    })
    expect(await screen.findByText('Jo Female')).toBeInTheDocument()
    expect(screen.getByText('Sam Male')).toBeInTheDocument()
    expect(screen.getByText('Female MVP points')).toBeInTheDocument()
    expect(server.payloads('/FeatureDashboardMvpLoad')).toEqual([
      {seasonId: season.id},
    ])
  })
})
