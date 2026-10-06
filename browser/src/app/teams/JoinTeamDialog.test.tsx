import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {mockServer} from '../../test/server'
import {renderScreen} from '../common/screenTesting'
import {JoinTeamDialog} from './JoinTeamDialog'

const setup = (signUpOpen = true) => {
  const season = makeSeason({name: 'Winter 2026', signUpOpen})
  const red = makeTeam({seasonId: season.id, name: 'Red Rockets', division: 1})
  const blue = makeTeam({seasonId: season.id, name: 'Blue Bolts'})
  return {season, red, blue}
}

describe('JoinTeamDialog', () => {
  it('searches teams on the server and requests to join one', async () => {
    const {season, red, blue} = setup()
    let pending = false
    const server = mockServer({
      '/FeatureTeamSetupLoad': (payload) => {
        const {search} = payload as {search?: string}
        if (pending) return {teams: [], pendingTeam: red}
        return {teams: search ? [red] : [red, blue]}
      },
      '/MemberRequestCreate': () => {
        pending = true
        return {}
      },
    })
    const onOpenChange = vi.fn()
    const {user} = renderScreen(<JoinTeamDialog open onOpenChange={onOpenChange} />, {
      auth: makeAuth(),
      context: {season},
    })
    const dialog = screen.getByRole('dialog', {name: 'Join a team'})
    expect(dialog).toHaveAccessibleDescription(/Find your team in Winter 2026/)
    expect(within(dialog).getByRole('status', {name: 'Loading teams'})).toBeInTheDocument()
    expect(await within(dialog).findByText('Blue Bolts')).toBeInTheDocument()
    expect(within(dialog).getByText('Div 1')).toBeInTheDocument()
    expect(server.payloads('/FeatureTeamSetupLoad')).toEqual([{seasonId: season.id, search: ''}])

    await user.type(within(dialog).getByRole('searchbox', {name: 'Search teams'}), 'red')
    await waitFor(() =>
      expect(within(dialog).queryByText('Blue Bolts')).not.toBeInTheDocument(),
    )
    expect(server.payloads('/FeatureTeamSetupLoad')).toContainEqual({seasonId: season.id, search: 'red'})

    await user.click(within(dialog).getByRole('button', {name: 'Request to join'}))
    const confirm = await screen.findByRole('dialog', {name: 'Join Red Rockets?'})
    await user.click(within(confirm).getByRole('button', {name: 'Join team'}))
    expect(
      await screen.findByText(
        'Request successfully created. Please wait while the captain approves the request.',
      ),
    ).toBeInTheDocument()
    expect(server.payloads('/MemberRequestCreate')).toEqual([red.id])
    expect(await within(dialog).findByText('Request pending')).toBeInTheDocument()
    await user.click(within(dialog).getAllByRole('button', {name: 'Close'})[0])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows an empty search result and notes closed sign-ups', async () => {
    const {season} = setup(false)
    mockServer({'/FeatureTeamSetupLoad': () => ({teams: []})})
    renderScreen(<JoinTeamDialog open onOpenChange={vi.fn()} />, {
      auth: makeAuth(),
      context: {season},
    })
    expect(await screen.findByText('No teams found')).toBeInTheDocument()
    expect(screen.getByText('Team sign-ups are closed for this season.')).toBeInTheDocument()
  })

  it('creates a new team and makes it the player’s team', async () => {
    const {season} = setup()
    const team = makeTeam({seasonId: season.id, name: 'Fresh Start'})
    mockServer({
      '/FeatureTeamSetupLoad': () => ({teams: []}),
      '/TeamCurrentCreate': () => ({team, member: {}}),
    })
    const onOpenChange = vi.fn()
    const {user, context} = renderScreen(<JoinTeamDialog open onOpenChange={onOpenChange} />, {
      auth: makeAuth(),
      context: {season},
    })
    await screen.findByText('No teams found')
    await user.click(screen.getByRole('button', {name: 'Create new team'}))
    const create = await screen.findByRole('dialog', {name: 'New team'})
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Join a team'})).not.toBeInTheDocument())
    await user.type(within(create).getByRole('textbox', {name: 'Team name'}), 'Fresh Start')
    await user.click(within(create).getByRole('button', {name: 'Create team'}))
    expect(await screen.findByText('Team created.')).toBeInTheDocument()
    expect(context.teamSet).toHaveBeenCalledWith(team)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not load anything while closed', () => {
    const {season} = setup()
    const server = mockServer()
    renderScreen(<JoinTeamDialog open={false} onOpenChange={vi.fn()} />, {
      auth: makeAuth(),
      context: {season},
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
  })
})
