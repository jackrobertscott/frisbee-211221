import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, testId} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, THandler} from '../../test/server'
import {findDialog, setupUser, spyToasts} from '../seasons/screenTestUtils'
import {MissingReportsButton} from './MissingReports'

const team = (name: string) => ({id: testId(), name, color: 'hsla(10, 50%, 50%, 1)'})

const rounds = () => [
  {
    title: 'Round 1',
    fixtureId: testId(),
    date: '2025-06-01T08:00:00.000Z',
    missingTeams: [team('Alpha'), team('Bravo')],
  },
  {
    title: 'Round 2',
    fixtureId: testId(),
    date: '2025-06-08T08:00:00.000Z',
    missingTeams: [team('Charlie')],
  },
  {
    title: 'Round 9',
    fixtureId: testId(),
    date: '2999-06-15T08:00:00.000Z',
    missingTeams: [team('Delta')],
  },
]

const renderButton = (handler: THandler) => {
  const server = mockServer({'/ReportMissingList': handler})
  renderApp(<MissingReportsButton seasonId="season-1" />, {
    auth: makeAuth({user: {admin: true}}),
  })
  return server
}

describe('MissingReportsButton', () => {
  it('lists teams missing reports, opening played fixtures', async () => {
    const user = setupUser()
    const server = renderButton(rounds)
    await user.click(screen.getByRole('button', {name: 'Missing reports'}))
    const modal = await findDialog('Missing reports')
    expect(
      await within(modal).findByText('3 reports outstanding across 2 played fixtures.'),
    ).toBeInTheDocument()
    expect(server.payloads('/ReportMissingList')).toEqual([{seasonId: 'season-1'}])
    const round1 = within(modal).getByRole('button', {name: /Round 1/})
    const round9 = within(modal).getByRole('button', {name: /Round 9/})
    expect(round1).toHaveAttribute('aria-expanded', 'true')
    expect(round9).toHaveAttribute('aria-expanded', 'false')
    expect(within(modal).getAllByText('Alpha')).not.toHaveLength(0)
    expect(within(modal).queryByText('Delta')).not.toBeInTheDocument()
    await user.click(round9)
    expect(within(modal).getByText('Delta')).toBeInTheDocument()
    await user.click(round1)
    expect(round1).toHaveAttribute('aria-expanded', 'false')
    expect(modal.querySelector('pre')).toHaveTextContent(
      'Round 1 - 1 June - Alpha - Bravo Round 2 - 8 June - Charlie',
    )
  })

  it('copies the played fixtures as text', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    renderButton(rounds)
    await user.click(screen.getByRole('button', {name: 'Missing reports'}))
    const modal = await findDialog('Missing reports')
    await user.click(await within(modal).findByRole('button', {name: 'Copy as text'}))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Copied missing reports'),
    )
    expect(await navigator.clipboard.readText()).toBe(
      'Round 1 - 1 June\n- Alpha\n- Bravo\n\nRound 2 - 8 June\n- Charlie',
    )
  })

  it('only counts played fixtures', async () => {
    const user = setupUser()
    renderButton(() => rounds().slice(2))
    await user.click(screen.getByRole('button', {name: 'Missing reports'}))
    const modal = await findDialog('Missing reports')
    expect(
      await within(modal).findByText('No outstanding reports for played fixtures.'),
    ).toBeInTheDocument()
    expect(within(modal).queryByRole('button', {name: 'Copy as text'})).not.toBeInTheDocument()
    expect(within(modal).queryByText(/outstanding across/)).not.toBeInTheDocument()
  })

  it('celebrates when nothing is missing and closes', async () => {
    const user = setupUser()
    renderButton(() => [])
    await user.click(screen.getByRole('button', {name: 'Missing reports'}))
    const modal = await findDialog('Missing reports')
    expect(await within(modal).findByText('No missing reports found.')).toBeInTheDocument()
    const [footerClose] = within(modal).getAllByRole('button', {name: 'Close'})
    await user.click(footerClose)
    await waitFor(() => expect(modal).not.toBeInTheDocument())
  })
})
