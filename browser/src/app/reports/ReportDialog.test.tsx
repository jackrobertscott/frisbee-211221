import {TFeatureAgainstOption} from '@shared/endpoints/FeatureDef'
import {TSeason} from '@shared/schemas/ioSeason'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {TAuth} from '../../core/auth/AuthContext'
import {makeAuth, makeSeason} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError, THandler} from '../../test/server'
import {
  chooseOption,
  findDialog,
  setupUser,
  spyToasts,
} from '../seasons/screenTestUtils'
import {ReportDialog} from './ReportDialog'
import {makeLeague, makeReport} from './reportTestData'

type TEditorPayload = {seasonId: string; fixtureId?: string; teamId?: string}

const isEditorPayload = (value: unknown): value is TEditorPayload =>
  typeof value === 'object' && value !== null && 'seasonId' in value

const setup = (
  opts: {
    season?: TSeason
    auth?: (league: ReturnType<typeof makeLeague>) => TAuth
    against?: (payload: TEditorPayload) => TFeatureAgainstOption[]
    handlers?: Record<string, THandler>
  } = {},
) => {
  const league = makeLeague()
  const season = opts.season ?? makeSeason({genderDivision: 'mixed'})
  const auth = opts.auth?.(league) ?? makeAuth({team: league.ours})
  const server = mockServer({
    '/FeatureReportEditorLoad': (payload) => {
      if (!isEditorPayload(payload)) throw new Error('bad payload')
      return {
        fixtures: league.fixtures,
        teams: league.teams,
        againstOptions:
          payload.fixtureId && payload.teamId
            ? (opts.against?.(payload) ?? league.against)
            : [],
      }
    },
    ...opts.handlers,
  })
  const onSubmitted = vi.fn<() => void>()
  const onOpenChange = vi.fn<(open: boolean) => void>()
  renderApp(
    <ReportDialog open onOpenChange={onOpenChange} onSubmitted={onSubmitted} />,
    {auth, context: {season}},
  )
  return {league, season, auth, server, onSubmitted, onOpenChange}
}

const typeScore = async (
  user: ReturnType<typeof setupUser>,
  scope: HTMLElement,
  label: string,
  value: string,
) => {
  const input = within(scope).getByRole('spinbutton', {name: label})
  await user.clear(input)
  await user.type(input, `${value}{Enter}`)
}

/** Waits for the single loading state to give way to the full form. */
const findReadyForm = async () => {
  const modal = await findDialog('Report score')
  await within(modal).findByRole('spinbutton', {name: 'Your score'})
  return modal
}

describe('ReportDialog (player report)', () => {
  it('loads everything behind one spinner then defaults to the latest played fixture', async () => {
    const {league, season, server} = setup()
    const modal = await findDialog('Report score')
    expect(within(modal).getByRole('status', {name: 'Loading report'})).toBeInTheDocument()
    expect(within(modal).getByRole('button', {name: 'Submit report'})).toBeDisabled()
    await findReadyForm()
    expect(within(modal).getByRole('combobox', {name: 'Fixture'})).toHaveTextContent('Round 2')
    expect(within(modal).getByText('Disc Jockeys')).toBeInTheDocument()
    expect(within(modal).queryByRole('combobox', {name: 'Your team'})).not.toBeInTheDocument()
    expect(within(modal).getByRole('combobox', {name: 'Opponent'})).toHaveTextContent('Rivals')
    expect(server.payloads('/FeatureReportEditorLoad')).toEqual([
      {seasonId: season.id},
      {seasonId: season.id, fixtureId: league.round2.id, teamId: league.ours.id},
    ])
  })

  it('requires both scores', async () => {
    const user = setupUser()
    const {server, onSubmitted} = setup()
    const modal = await findReadyForm()
    await user.click(within(modal).getByRole('button', {name: 'Submit report'}))
    expect(within(modal).getByRole('alert')).toHaveTextContent('Both scores are required.')
    expect(server.payloads('/ReportCreate')).toEqual([])
    expect(onSubmitted).not.toHaveBeenCalled()
    await typeScore(user, modal, 'Your score', '1')
    expect(within(modal).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('submits the score, eligible MVPs and spirit', async () => {
    const user = setupUser()
    const {league, server, onSubmitted} = setup({
      handlers: {'/ReportCreate': () => makeReport()},
    })
    const modal = await findReadyForm()
    await typeScore(user, modal, 'Your score', '15')
    await typeScore(user, modal, 'Opponent score', '12')

    await user.click(within(modal).getByRole('combobox', {name: /Male MVP/}))
    const maleOptions = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(maleOptions.map((o) => o.textContent)).toEqual(['Max Opp'])
    await user.click(maleOptions[0])

    await user.click(within(modal).getByRole('combobox', {name: /Female MVP/}))
    const femaleOptions = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(femaleOptions.map((o) => o.textContent).sort()).toEqual(['Mia Opp', 'Zoe Opp'])
    await user.click(within(screen.getByRole('listbox')).getByRole('option', {name: 'Zoe Opp'}))

    await user.click(within(modal).getByRole('radio', {name: /^4/}))
    await user.type(within(modal).getByLabelText(/Comment/), 'Great game')
    await user.click(within(modal).getByRole('button', {name: 'Submit report'}))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
    expect(server.payloads('/ReportCreate')).toEqual([
      {
        teamId: league.ours.id,
        teamAgainstId: league.rivals.id,
        fixtureId: league.round2.id,
        scoreFor: 15,
        scoreAgainst: 12,
        mvpMale: league.max.id,
        mvpFemale: league.zoe.id,
        spirit: 4,
        spiritComment: 'Great game',
        spiritP1: 2,
        spiritP2: 2,
        spiritP3: 2,
        spiritP4: 2,
        spiritP5: 2,
      },
    ])
  })

  it('reloads the opposition when another fixture is picked', async () => {
    const user = setupUser()
    const {league, server} = setup({
      against: (payload) =>
        payload.fixtureId === league.round1.id
          ? [
              {team: league.rivals, users: []},
              {team: league.others, users: []},
            ]
          : league.against,
    })
    const modal = await findReadyForm()
    await chooseOption(user, 'Fixture', /Round 1/)
    await waitFor(() =>
      expect(server.payloads('/FeatureReportEditorLoad').at(-1)).toEqual(
        expect.objectContaining({fixtureId: league.round1.id}),
      ),
    )
    const opponent = within(modal).getByRole('combobox', {name: 'Opponent'})
    // The current opponent stays picked when it also played in the new fixture.
    await waitFor(() => expect(opponent).toBeEnabled())
    expect(opponent).toHaveTextContent('Rivals')
    await chooseOption(user, opponent, /Others/)
    expect(opponent).toHaveTextContent('Others')
    expect(within(modal).getByRole('combobox', {name: /Male MVP/})).toBeEnabled()
  })

  it('explains when no opposition is found', async () => {
    setup({against: () => []})
    const modal = await findDialog('Report score')
    expect(
      await within(modal).findByText('No opposition found for this team in the selected fixture.'),
    ).toBeInTheDocument()
    const mvp = within(modal).getByRole('combobox', {name: /Male MVP/})
    expect(mvp).toBeDisabled()
    expect(mvp).toHaveTextContent('Choose opponent first')
  })

  it('lets admins choose the team they report for', async () => {
    const user = setupUser()
    const {league, server} = setup({
      auth: () => makeAuth({user: {admin: true}}),
    })
    const modal = await findDialog('Report score')
    const team = await within(modal).findByRole('combobox', {name: 'Your team'})
    expect(within(modal).getByText('Submit a report')).toBeInTheDocument()
    await chooseOption(user, team, /Others/)
    await within(modal).findByRole('spinbutton', {name: 'Your score'})
    expect(server.payloads('/FeatureReportEditorLoad').at(-1)).toEqual(
      expect.objectContaining({teamId: league.others.id, fixtureId: league.round2.id}),
    )
  })

  it('shows only the female MVP slot in a women’s season', async () => {
    setup({season: makeSeason({genderDivision: 'women'})})
    const modal = await findReadyForm()
    expect(within(modal).getByRole('combobox', {name: /Female MVP/})).toBeInTheDocument()
    expect(within(modal).queryByRole('combobox', {name: /^Male MVP/})).not.toBeInTheDocument()
  })

  it('keeps the dialog open when the server rejects the report', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {onSubmitted} = setup({
      handlers: {
        '/ReportCreate': () => {
          throw serverError(409, 'Your team already reported this game.')
        },
      },
    })
    const modal = await findReadyForm()
    await typeScore(user, modal, 'Your score', '1')
    await typeScore(user, modal, 'Opponent score', '2')
    await user.click(within(modal).getByRole('button', {name: 'Submit report'}))
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith('Your team already reported this game.'),
    )
    expect(onSubmitted).not.toHaveBeenCalled()
    expect(modal).toBeInTheDocument()
  })

  it('closes on cancel', async () => {
    const user = setupUser()
    const {onOpenChange} = setup()
    const modal = await findDialog('Report score')
    await user.click(within(modal).getByRole('button', {name: 'Cancel'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders nothing without a season', () => {
    mockServer()
    renderApp(<ReportDialog open onOpenChange={vi.fn()} onSubmitted={vi.fn()} />, {
      auth: makeAuth(),
      context: {season: undefined},
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ReportDialog (official scoring)', () => {
  const official = () => makeSeason({genderDivision: 'mixed', useOfficialScoring: true})

  it('rates five spirit categories and requires a comment for extreme totals', async () => {
    const user = setupUser()
    const {league, server, onSubmitted} = setup({
      season: official(),
      handlers: {'/ReportCreate': () => makeReport()},
    })
    const modal = await findReadyForm()
    expect(within(modal).getByText('MVP 1 votes are worth 5 points, MVP 2 votes 3 points.')).toBeInTheDocument()
    expect(within(modal).getByRole('combobox', {name: /^Male MVP 2/})).toBeInTheDocument()
    expect(within(modal).getByText('10')).toBeInTheDocument()
    await typeScore(user, modal, 'Your score', '15')
    await typeScore(user, modal, 'Opponent score', '7')
    for (const category of [
      'Rules Knowledge and Use',
      'Fouls and Body Contact',
      'Fair-Mindedness',
    ])
      await chooseOption(user, category, '4. Legendary')
    expect(within(modal).getByText('16')).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', {name: 'Submit report'}))
    expect(within(modal).getByRole('alert')).toHaveTextContent(
      'A comment is required when the total spirit score is below 9 or above 11.',
    )
    expect(server.payloads('/ReportCreate')).toEqual([])

    await user.type(within(modal).getByLabelText(/Comment/), 'Superb spirit')
    await user.click(within(modal).getByRole('button', {name: 'Submit report'}))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
    expect(server.payloads('/ReportCreate')).toEqual([
      expect.objectContaining({
        fixtureId: league.round2.id,
        spiritP1: 4,
        spiritP2: 4,
        spiritP3: 4,
        spiritP4: 2,
        spiritP5: 2,
        spiritComment: 'Superb spirit',
      }),
    ])
  })

  it('does not offer the same player for both female MVP slots', async () => {
    const user = setupUser()
    setup({season: official()})
    const modal = await findReadyForm()
    await chooseOption(user, /^Female MVP 1/, 'Mia Opp')
    await user.click(within(modal).getByRole('combobox', {name: /^Female MVP 2/}))
    const options = within(await screen.findByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Zoe Opp'])
  })
})
