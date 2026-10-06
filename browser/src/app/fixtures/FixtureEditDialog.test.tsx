import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam, testId} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {pickOption, pickToday, renderScreen} from '../common/screenTesting'
import {FixtureEditDialog} from './FixtureEditDialog'

const NOW = '2026-01-01T00:00:00.000Z'

const setup = () => {
  const season = makeSeason()
  const teams: TTeam[] = ['Red Rockets', 'Blue Bolts', 'Green Giants', 'Gold Geese'].map(
    (name) => makeTeam({seasonId: season.id, name, division: 1}),
  )
  const [red, blue, green, gold] = teams
  const fixture: TFixture = {
    id: testId(),
    createdOn: NOW,
    updatedOn: NOW,
    seasonId: season.id,
    userId: testId(),
    title: 'Round 3',
    date: '2026-03-07T09:30:00.000Z',
    grading: false,
    games: [
      {id: testId(), team1Id: red.id, team2Id: blue.id, time: '6:00pm', place: 'Field 1', team1Score: 10, team2Score: 4},
      {id: testId(), team1Id: green.id, team2Id: gold.id, time: '7:00pm', place: 'Field 2'},
    ],
  }
  return {season, teams, red, blue, green, gold, fixture}
}

const renderDialog = (
  fixture: TFixture | 'new',
  teams: TTeam[],
  season = makeSeason(),
) => {
  const onClose = vi.fn()
  const onDone = vi.fn()
  const view = renderScreen(
    <FixtureEditDialog fixture={fixture} teams={teams} onClose={onClose} onDone={onDone} />,
    {auth: makeAuth({user: {admin: true}}), context: {season}},
  )
  return {...view, onClose, onDone}
}

describe('FixtureEditDialog', () => {
  it('validates a new fixture step by step before creating it', async () => {
    const {season, teams, red, blue, green, gold} = setup()
    const server = mockServer({
      '/FixtureCreate': (payload) => ({...(payload as object), id: testId(), createdOn: NOW, updatedOn: NOW, userId: testId()}),
    })
    const {user, onDone} = renderDialog('new', teams, season)
    const dialog = screen.getByRole('dialog', {name: 'Add fixture'})
    const save = within(dialog).getByRole('button', {name: 'Add fixture'})
    // One blank game per pair of teams.
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)

    await user.click(save)
    expect(within(dialog).getByText('Enter a title for the fixture.')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', {name: 'Title'}), '  Round 1 ')
    await user.click(save)
    expect(within(dialog).getByText('Pick the date of the fixture.')).toBeInTheDocument()
    await pickToday(user, within(dialog).getByRole('button', {name: /^Date/}))
    await user.click(save)
    expect(
      within(dialog).getByText('Pick both teams for every game, or remove empty rows.'),
    ).toBeInTheDocument()

    await pickOption(user, within(dialog).getByRole('combobox', {name: 'Game 1 team 1'}), /Red Rockets/)
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'Game 1 team 2'}), /Red Rockets/)
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'Game 2 team 1'}), /Green Giants/)
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'Game 2 team 2'}), /Gold Geese/)
    expect(within(dialog).getByText('Playing more than once: Red Rockets')).toBeInTheDocument()
    await user.click(save)
    expect(within(dialog).getByText('A team can’t play itself.')).toBeInTheDocument()

    await pickOption(user, within(dialog).getByRole('combobox', {name: 'Game 1 team 2'}), /Blue Bolts/)
    expect(within(dialog).queryByText(/Playing more than once/)).not.toBeInTheDocument()
    await user.click(save)
    expect(within(dialog).getByText('Enter a time and place for every game.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', {name: 'Game 1 time'}), '6pm ')
    await user.type(within(dialog).getByRole('textbox', {name: 'Game 1 place'}), 'Field 1')
    await user.type(within(dialog).getByRole('textbox', {name: 'Game 2 time'}), '7pm')
    await user.type(within(dialog).getByRole('textbox', {name: 'Game 2 place'}), ' Field 2')
    await user.click(within(dialog).getByRole('switch', {name: /Grading round/}))
    await user.click(save)

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(await screen.findByText('Round 1 added')).toBeInTheDocument()
    const [payload] = server.payloads('/FixtureCreate')
    expect(payload).toMatchObject({
      seasonId: season.id,
      title: 'Round 1',
      grading: true,
      games: [
        {team1Id: red.id, team2Id: blue.id, time: '6pm', place: 'Field 1'},
        {team1Id: green.id, team2Id: gold.id, time: '7pm', place: 'Field 2'},
      ],
    })
    const sent = payload as {date: string}
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    expect(sent.date).toBe(today.toISOString())
  })

  it('tells admins to add teams before scheduling games', () => {
    mockServer()
    renderDialog('new', [])
    expect(screen.getByText('Add teams to this season before scheduling games.')).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Add game'})).not.toBeInTheDocument()
  })

  it('edits an existing fixture: add and remove games, swap teams, then save', async () => {
    const {teams, red, blue, green, gold, fixture} = setup()
    const server = mockServer({
      '/FixtureUpdate': (payload) => ({...fixture, ...(payload as object)}),
    })
    const {user, onDone} = renderDialog(fixture, teams)
    const dialog = screen.getByRole('dialog', {name: 'Edit fixture'})
    expect(within(dialog).getByRole('textbox', {name: 'Title'})).toHaveValue('Round 3')
    expect(within(dialog).getByRole('combobox', {name: 'Game 1 team 1'})).toHaveTextContent('Red Rockets')

    await user.click(within(dialog).getByRole('button', {name: 'Add game'}))
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
    await user.click(within(dialog).getByRole('button', {name: 'Remove game 3'}))
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)

    await user.click(within(dialog).getByRole('button', {name: 'Swap teams in game 1'}))
    expect(within(dialog).getByRole('combobox', {name: 'Game 1 team 1'})).toHaveTextContent('Blue Bolts')
    await user.click(within(dialog).getByRole('button', {name: 'Save changes'}))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(await screen.findByText('Round 3 saved')).toBeInTheDocument()
    expect(server.payloads('/FixtureUpdate')).toEqual([
      {
        fixtureId: fixture.id,
        title: 'Round 3',
        date: fixture.date,
        grading: false,
        games: [
          {...fixture.games[0], team1Id: blue.id, team2Id: red.id, team1Score: 4, team2Score: 10},
          {...fixture.games[1], team1Id: green.id, team2Id: gold.id},
        ],
      },
    ])
  })

  it('swaps the time and place of two games', async () => {
    const {teams, fixture} = setup()
    const server = mockServer({
      '/FixtureUpdate': (payload) => ({...fixture, ...(payload as object)}),
    })
    const {user} = renderDialog(fixture, teams)
    const dialog = screen.getByRole('dialog', {name: 'Edit fixture'})
    await user.click(within(dialog).getByRole('button', {name: 'Swap time and place of game 1'}))
    const swap = await screen.findByRole('dialog', {name: 'Swap game slot'})
    expect(swap).toHaveAccessibleDescription(/currently 6:00pm · Field 1/)
    expect(within(swap).getByText('7:00pm · Field 2')).toBeInTheDocument()
    await user.click(within(swap).getByRole('button', {name: 'Swap'}))
    expect(await screen.findByText('Game slot changed. Remember to save the fixture.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Swap game slot'})).not.toBeInTheDocument(),
    )
    // Rows re-sort by slot, so the Green v Gold game is now first at 6pm.
    expect(within(dialog).getByRole('combobox', {name: 'Game 1 team 1'})).toHaveTextContent('Green Giants')
    expect(within(dialog).getByRole('textbox', {name: 'Game 1 time'})).toHaveValue('6:00pm')
    await user.click(within(dialog).getByRole('button', {name: 'Save changes'}))
    await waitFor(() => expect(server.payloads('/FixtureUpdate')).toHaveLength(1))
    const [payload] = server.payloads('/FixtureUpdate') as Array<{games: TFixture['games']}>
    expect(payload.games.map((g) => [g.id, g.time, g.place])).toEqual([
      [fixture.games[1].id, '6:00pm', 'Field 1'],
      [fixture.games[0].id, '7:00pm', 'Field 2'],
    ])
  })

  it('keeps the dialog open and shows the server error when saving fails', async () => {
    const {teams, fixture} = setup()
    mockServer({
      '/FixtureUpdate': () => {
        throw serverError(400, 'Fixture title already used.')
      },
    })
    const {user, onDone} = renderDialog(fixture, teams)
    await user.click(screen.getByRole('button', {name: 'Save changes'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fixture title already used.')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', {name: 'Edit fixture'})).toBeInTheDocument()
  })

  it('deletes a fixture after confirmation', async () => {
    const {teams, fixture} = setup()
    const server = mockServer({'/FixtureDelete': () => undefined})
    const {user, onDone, onClose} = renderDialog(fixture, teams)
    await user.click(screen.getByRole('button', {name: 'Delete'}))
    const confirm = await screen.findByRole('dialog', {name: 'Delete this fixture?'})
    await user.click(within(confirm).getByRole('button', {name: 'Delete fixture'}))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(server.payloads('/FixtureDelete')).toEqual([{fixtureId: fixture.id}])
    expect(await screen.findByText('Round 3 deleted')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Delete this fixture?'})).not.toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', {name: 'Cancel'}))
    expect(onClose).toHaveBeenCalled()
  })
})
