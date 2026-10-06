import {TMember} from '@shared/schemas/ioMember'
import {TUserPublic} from '@shared/schemas/ioUser'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeTeam, makeUser, testId} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {pickOption, renderScreen} from '../common/screenTesting'
import {TeamMembers} from './TeamMembers'

const NOW = '2026-01-01T00:00:00.000Z'

const publicUser = (firstName: string, lastName: string): TUserPublic => {
  const {id, createdOn, updatedOn, genderMatching} = makeUser({firstName, lastName})
  return {id, createdOn, updatedOn, firstName, lastName, genderMatching}
}

const setup = (opts: {captain: boolean}) => {
  const team = makeTeam({name: 'Red Rockets'})
  const me = publicUser('Casey', 'Captain')
  const sam = publicUser('Sam', 'Player')
  const pat = publicUser('Pat', 'Pending')
  const member = (user: TUserPublic, patch: Partial<TMember> = {}): TMember => ({
    id: testId(),
    createdOn: NOW,
    updatedOn: NOW,
    userId: user.id,
    seasonId: team.seasonId,
    teamId: team.id,
    pending: false,
    ...patch,
  })
  const mine = member(me, {captain: opts.captain})
  const samMember = member(sam)
  const patMember = member(pat, {pending: true})
  const roster = {
    current: mine,
    members: [mine, samMember, patMember],
    users: [me, sam, pat],
  }
  const auth = makeAuth({user: {id: me.id, firstName: 'Casey', lastName: 'Captain'}, team})
  return {team, roster, mine, samMember, patMember, auth}
}

describe('TeamMembers', () => {
  it('lets captains accept, decline, promote and remove members', async () => {
    const {team, roster, samMember, patMember, auth} = setup({captain: true})
    const server = mockServer({
      '/MemberListOfTeam': () => roster,
      '/MemberAcceptOrDecline': () => undefined,
      '/MemberSetCaptain': () => samMember,
      '/MemberRemove': () => undefined,
    })
    const {user} = renderScreen(<TeamMembers team={team} />, {auth})
    expect(screen.getByRole('status', {name: 'Loading members'})).toBeInTheDocument()
    expect(await screen.findByText('Sam Player')).toBeInTheDocument()
    expect(screen.getByText('2 players')).toBeInTheDocument()
    expect(screen.getByText('Captain')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Accept'}))
    expect(await screen.findByText('Membership request accepted.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Decline'}))
    expect(await screen.findByText('Membership request declined.')).toBeInTheDocument()
    expect(server.payloads('/MemberAcceptOrDecline')).toEqual([
      {memberId: patMember.id, accept: true},
      {memberId: patMember.id, accept: false},
    ])

    await user.click(screen.getByRole('button', {name: 'Set Sam Player as captain'}))
    const promote = await screen.findByRole('dialog', {name: 'Set Sam Player as captain?'})
    await user.click(within(promote).getByRole('button', {name: 'Confirm'}))
    expect(await screen.findByText('Captain of team changed.')).toBeInTheDocument()
    expect(server.payloads('/MemberSetCaptain')).toEqual([samMember.id])

    await user.click(screen.getByRole('button', {name: 'Remove Sam Player from team'}))
    const remove = await screen.findByRole('dialog', {name: 'Remove Sam Player?'})
    expect(remove).toHaveAccessibleDescription(/remove this person from the team/)
    await user.click(within(remove).getByRole('button', {name: 'Remove'}))
    expect(await screen.findByText('Member removed from team.')).toBeInTheDocument()
    expect(server.payloads('/MemberRemove')).toEqual([samMember.id])
    // Each change reloads the roster.
    expect(server.payloads('/MemberListOfTeam').length).toBeGreaterThanOrEqual(5)
  })

  it('hides management actions from regular players and lets them leave', async () => {
    const {team, roster, mine, auth} = setup({captain: false})
    const server = mockServer({
      '/MemberListOfTeam': () => roster,
      '/MemberRemove': () => undefined,
    })
    const onLeft = vi.fn()
    const {user, context} = renderScreen(<TeamMembers team={team} onLeft={onLeft} />, {auth})
    await screen.findByText('Sam Player')
    expect(screen.getByRole('button', {name: 'Add member'})).toBeDisabled()
    expect(screen.queryByRole('button', {name: 'Accept'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /Remove .* from team/})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Leave team'}))
    const leave = await screen.findByRole('dialog', {name: 'Leave team?'})
    expect(leave).toHaveAccessibleDescription(/remove yourself from the team/)
    await user.click(within(leave).getByRole('button', {name: 'Leave team'}))
    await waitFor(() => expect(onLeft).toHaveBeenCalled())
    expect(context.teamSet).toHaveBeenCalledWith(undefined)
    expect(server.payloads('/MemberRemove')).toEqual([mine.id])
  })

  it('shows an empty roster and a load failure', async () => {
    const team = makeTeam()
    mockServer({'/MemberListOfTeam': () => ({members: [], users: []})})
    const first = renderScreen(<TeamMembers team={team} />, {auth: makeAuth({user: {admin: true}})})
    expect(await screen.findByText('No members yet')).toBeInTheDocument()
    expect(screen.getByText('0 players')).toBeInTheDocument()
    // Admins can manage any roster.
    expect(screen.getByRole('button', {name: 'Add member'})).toBeEnabled()
    first.unmount()

    mockServer({
      '/MemberListOfTeam': () => {
        throw serverError(500, 'Down')
      },
    })
    renderScreen(<TeamMembers team={team} />, {auth: makeAuth({user: {admin: true}})})
    expect(await screen.findByText('Members could not be loaded')).toBeInTheDocument()
  })

  it('adds an existing player by email', async () => {
    const {team, roster, auth} = setup({captain: true})
    const jo = publicUser('Jo', 'Existing')
    const server = mockServer({
      '/MemberListOfTeam': () => roster,
      '/MemberLookupByEmail': () => ({exists: true, user: jo}),
      '/MemberCreate': () => ({}),
    })
    const {user} = renderScreen(<TeamMembers team={team} />, {auth})
    await screen.findByText('Sam Player')
    await user.click(screen.getByRole('button', {name: 'Add member'}))
    const dialog = await screen.findByRole('dialog', {name: 'Add member'})
    expect(dialog).toHaveAccessibleDescription('Add a player to Red Rockets by their email address.')
    await user.type(within(dialog).getByRole('textbox', {name: 'Email'}), 'jo@example.com')
    await user.click(within(dialog).getByRole('button', {name: 'Continue'}))
    expect(await screen.findByText('Jo Existing added to team.')).toBeInTheDocument()
    expect(server.payloads('/MemberLookupByEmail')).toEqual([{teamId: team.id, email: 'jo@example.com'}])
    expect(server.payloads('/MemberCreate')).toEqual([{teamId: team.id, email: 'jo@example.com'}])
    await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Add member'})).not.toBeInTheDocument())
  })

  it('creates a new player when the email is unknown', async () => {
    const {team, roster, auth} = setup({captain: true})
    const server = mockServer({
      '/MemberListOfTeam': () => roster,
      '/MemberLookupByEmail': () => ({exists: false}),
      '/MemberCreate': () => ({}),
    })
    const {user} = renderScreen(<TeamMembers team={team} />, {auth})
    await screen.findByText('Sam Player')
    await user.click(screen.getByRole('button', {name: 'Add member'}))
    const dialog = await screen.findByRole('dialog', {name: 'Add member'})
    await user.type(within(dialog).getByRole('textbox', {name: 'Email'}), 'new@example.com{Enter}')
    expect(
      await within(dialog).findByRole('textbox', {name: 'First name'}),
    ).toBeInTheDocument()
    expect(dialog).toHaveAccessibleDescription(/No account uses this email yet/)
    expect(within(dialog).getByRole('textbox', {name: 'Email'})).toHaveAttribute('readonly')

    await user.click(within(dialog).getByRole('button', {name: 'Back'}))
    expect(within(dialog).queryByRole('textbox', {name: 'First name'})).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', {name: 'Continue'}))

    await user.type(await within(dialog).findByRole('textbox', {name: 'First name'}), 'Nina')
    await user.type(within(dialog).getByRole('textbox', {name: 'Last name'}), 'New')
    await pickOption(user, within(dialog).getByRole('combobox', {name: 'Gender matching'}), 'Female')
    await user.click(within(dialog).getByRole('button', {name: 'Create & add'}))
    expect(await screen.findByText('Member created and added to team.')).toBeInTheDocument()
    expect(server.payloads('/MemberCreate')).toEqual([
      {
        teamId: team.id,
        email: 'new@example.com',
        firstName: 'Nina',
        lastName: 'New',
        genderMatching: 'female',
      },
    ])
  })
})
