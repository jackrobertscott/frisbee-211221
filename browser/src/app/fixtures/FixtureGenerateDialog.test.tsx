import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam, testId} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {renderScreen, userError} from '../common/screenTesting'
import {FixtureGenerateDialog} from './FixtureGenerateDialog'

const NOW = '2026-01-01T00:00:00.000Z'

const fixtureOn = (seasonId: string, date: string): TFixture => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  seasonId,
  userId: testId(),
  title: 'Round',
  date,
  games: [],
})

const renderDialog = (teams: TTeam[], fixtures: TFixture[] = []) => {
  const season = makeSeason()
  const onDone = vi.fn()
  const onOpenChange = vi.fn()
  const view = renderScreen(
    <FixtureGenerateDialog
      open
      onOpenChange={onOpenChange}
      seasonId={season.id}
      teams={teams}
      fixtures={fixtures}
      onDone={onDone}
    />,
    {auth: makeAuth({user: {admin: true}}), context: {season}},
  )
  const dialog = screen.getByRole('dialog', {name: 'Generate fixtures'})
  return {...view, season, onDone, onOpenChange, dialog}
}

const fourTeams = () =>
  ['A', 'B', 'C', 'D'].map((name, i) =>
    makeTeam({name: `Team ${name}`, division: i < 2 ? 1 : 2}),
  )

describe('FixtureGenerateDialog', () => {
  it('summarises divisions and generates rounds from the slots', async () => {
    const lastRound = fixtureOn(testId(), '2026-03-01T10:00:00.000Z')
    const server = mockServer({'/FixtureGenerate': () => undefined})
    const {user, dialog, season, onDone} = renderDialog(fourTeams(), [lastRound])
    expect(within(dialog).getByText(/2 divisions · 4 teams · 2 games per round/)).toBeInTheDocument()
    // Starts a week after the last round.
    expect(within(dialog).getByRole('button', {name: /^Starting date/})).not.toHaveTextContent('Pick a date')

    const generate = within(dialog).getByRole('button', {name: 'Generate'})
    await user.click(generate)
    expect(within(dialog).getByText('Please enter a valid number of rounds.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('spinbutton', {name: 'Number of rounds'}), '3')
    await user.tab()
    await user.click(generate)
    expect(within(dialog).getByText('Fill in or remove empty slots.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 1 time'}), '6pm')
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 1 place'}), 'Field 1 ')
    await user.click(generate)
    expect(
      within(dialog).getByText('Not enough slots have been added — each round has 2 games.'),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', {name: 'Add slot'}))
    await user.click(within(dialog).getByRole('button', {name: 'Add slot'}))
    await user.click(within(dialog).getByRole('button', {name: 'Remove slot 3'}))
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 2 time'}), '7pm')
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 2 place'}), 'Field 1')
    await user.click(generate)

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(await screen.findByText('3 rounds generated')).toBeInTheDocument()
    const [payload] = server.payloads('/FixtureGenerate') as Array<{
      startingDate: string
      slots: Array<{time: string; place: string}>
    }>
    expect(payload).toMatchObject({seasonId: season.id, roundCount: 3})
    expect(payload.slots).toEqual([
      expect.objectContaining({time: '6pm', place: 'Field 1'}),
      expect.objectContaining({time: '7pm', place: 'Field 1'}),
    ])
    const expected = new Date(lastRound.date)
    expected.setDate(expected.getDate() + 7)
    expected.setHours(0, 0, 0, 0)
    expect(payload.startingDate).toBe(expected.toISOString())
  })

  it('requires a starting date when there are no fixtures yet', async () => {
    mockServer()
    const {user, dialog} = renderDialog(fourTeams())
    await user.type(within(dialog).getByRole('spinbutton', {name: 'Number of rounds'}), '1')
    await user.tab()
    await user.click(within(dialog).getByRole('button', {name: 'Generate'}))
    expect(within(dialog).getByText('Please enter a valid starting date.')).toBeInTheDocument()
  })

  it('warns about teams without a division and refuses to generate', async () => {
    const teams = [makeTeam({name: 'Team A', division: 1}), makeTeam({name: 'Loose Team'})]
    mockServer()
    const {user, dialog} = renderDialog(teams, [fixtureOn(testId(), NOW)])
    expect(within(dialog).getByText(/Missing: Loose Team\./)).toBeInTheDocument()
    await user.type(within(dialog).getByRole('spinbutton', {name: 'Number of rounds'}), '2')
    await user.tab()
    await user.click(within(dialog).getByRole('button', {name: 'Generate'}))
    expect(
      within(dialog).getByText('Every team needs a division before generating.'),
    ).toBeInTheDocument()
  })

  it('needs enough slots for every game in a round', async () => {
    const teams = Array.from({length: 6}, (_, i) => makeTeam({name: `Team ${i}`, division: 1}))
    mockServer()
    const {user, dialog} = renderDialog(teams, [fixtureOn(testId(), NOW)])
    await user.type(within(dialog).getByRole('spinbutton', {name: 'Number of rounds'}), '1')
    await user.tab()
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 1 time'}), '6pm')
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 1 place'}), 'Field 1')
    await user.click(within(dialog).getByRole('button', {name: 'Generate'}))
    expect(
      within(dialog).getByText('Not enough slots have been added — each round has 3 games.'),
    ).toBeInTheDocument()
  })

  it('shows a server error and stays open', async () => {
    mockServer({
      '/FixtureGenerate': () => {
        throw userError(400, 'Teams are not balanced.')
      },
    })
    const {user, dialog, onDone} = renderDialog(fourTeams(), [fixtureOn(testId(), NOW)])
    await user.type(within(dialog).getByRole('spinbutton', {name: 'Number of rounds'}), '1')
    await user.tab()
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 1 time'}), '6pm')
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 1 place'}), 'Field 1')
    await user.click(within(dialog).getByRole('button', {name: 'Add slot'}))
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 2 time'}), '7pm')
    await user.type(within(dialog).getByRole('textbox', {name: 'Slot 2 place'}), 'Field 1')
    await user.click(within(dialog).getByRole('button', {name: 'Generate'}))
    expect(await screen.findByText('Teams are not balanced.')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('closes on cancel', async () => {
    mockServer()
    const {user, dialog, onOpenChange} = renderDialog(fourTeams())
    await user.click(within(dialog).getByRole('button', {name: 'Cancel'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
