import {TFixture} from '@shared/schemas/ioFixture'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, testId} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {pickOption, renderScreen, userError} from '../common/screenTesting'
import {FixtureAdjustDialog} from './FixtureAdjustDialog'

const NOW = '2026-01-01T00:00:00.000Z'

const fixture = (title: string, date: string): TFixture => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  seasonId: testId(),
  userId: testId(),
  title,
  date,
  games: [],
})

const fixtures = [
  fixture('Round 1', '2026-03-01T00:00:00.000Z'),
  fixture('Round 2', '2026-03-08T00:00:00.000Z'),
  fixture('Round 3', '2026-03-15T00:00:00.000Z'),
]

const renderDialog = () => {
  const season = makeSeason()
  const onDone = vi.fn()
  const onOpenChange = vi.fn()
  const view = renderScreen(
    <FixtureAdjustDialog
      open
      onOpenChange={onOpenChange}
      fixtures={fixtures}
      seasonId={season.id}
      onDone={onDone}
    />,
    {auth: makeAuth({user: {admin: true}}), context: {season}},
  )
  const dialog = screen.getByRole('dialog', {name: 'Adjust fixtures'})
  return {...view, season, onDone, onOpenChange, dialog}
}

describe('FixtureAdjustDialog', () => {
  it('previews and sends the adjustment', async () => {
    const server = mockServer({'/FixtureAdjustMultiple': () => ({count: 2})})
    const {user, dialog, season, onDone} = renderDialog()
    const apply = within(dialog).getByRole('button', {name: 'Adjust fixtures'})
    await user.click(apply)
    expect(within(dialog).getByText('Please select a reference fixture.')).toBeInTheDocument()

    await pickOption(user, within(dialog).getByRole('combobox', {name: 'After and including'}), /Round 2/)
    expect(within(dialog).queryByText('Please select a reference fixture.')).not.toBeInTheDocument()
    expect(within(dialog).getByText('2 fixtures will move 1 week later.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', {name: 'Increase'}))
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'Unit'}), 'Days')
    await user.click(within(dialog).getByRole('radio', {name: 'Backward (into past)'}))
    expect(within(dialog).getByText('2 fixtures will move 2 days earlier.')).toBeInTheDocument()

    await user.click(apply)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(await screen.findByText('Successfully adjusted 2 fixtures')).toBeInTheDocument()
    expect(server.payloads('/FixtureAdjustMultiple')).toEqual([
      {
        seasonId: season.id,
        referenceFixtureId: fixtures[1].id,
        amount: 2,
        unit: 'day',
        direction: 'backward',
      },
    ])
  })

  it('rejects an empty amount', async () => {
    mockServer()
    const {user, dialog} = renderDialog()
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'After and including'}), /Round 1/)
    await user.clear(within(dialog).getByRole('spinbutton', {name: 'Adjustment amount'}))
    await user.tab()
    await user.click(within(dialog).getByRole('button', {name: 'Adjust fixtures'}))
    expect(within(dialog).getByText('Please enter an amount greater than 0.')).toBeInTheDocument()
  })

  it('shows a server error without closing', async () => {
    mockServer({
      '/FixtureAdjustMultiple': () => {
        throw userError(400, 'Could not move fixtures.')
      },
    })
    const {user, dialog, onDone, onOpenChange} = renderDialog()
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'After and including'}), /Round 3/)
    expect(within(dialog).getByText('1 fixture will move 1 week later.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', {name: 'Adjust fixtures'}))
    expect(await screen.findByText('Could not move fixtures.')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', {name: 'Cancel'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
