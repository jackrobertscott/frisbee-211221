import {TTeam} from '@shared/schemas/ioTeam'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {mockServer, serverError} from '../../test/server'
import {TEAM_COLORS} from '../../utils/colors'
import {renderScreen} from '../common/screenTesting'
import {TeamAdminDialog, TeamCurrentCreateDialog} from './TeamDialogs'

const admin = () => makeAuth({user: {admin: true}})

const renderAdmin = (team: TTeam) => {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const onDeleted = vi.fn()
  const view = renderScreen(
    <TeamAdminDialog team={team} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />,
    {auth: admin()},
  )
  const dialog = screen.getByRole('dialog', {name: team.name})
  return {...view, dialog, onClose, onSaved, onDeleted}
}

describe('TeamAdminDialog', () => {
  it('saves edited details only once something changed', async () => {
    const team = makeTeam({name: 'Red Rockets', color: TEAM_COLORS[0], division: 1})
    const server = mockServer({
      '/TeamUpdate': (payload) => ({...team, ...(payload as object)}),
    })
    const {user, dialog, onSaved} = renderAdmin(team)
    expect(dialog).toHaveAccessibleDescription('Division 1')
    const save = within(dialog).getByRole('button', {name: 'Save changes'})
    expect(save).toBeDisabled()

    const name = within(dialog).getByRole('textbox', {name: 'Team name'})
    await user.clear(name)
    expect(save).toBeEnabled()
    await user.click(save)
    expect(within(dialog).getByText('Give the team a name.')).toBeInTheDocument()
    expect(server.payloads('/TeamUpdate')).toHaveLength(0)

    await user.type(name, 'Red Rocketeers')
    await user.type(within(dialog).getByRole('textbox', {name: /Public phone/}), '0400 111 222')
    // Enter submits the form too.
    await user.type(within(dialog).getByRole('textbox', {name: /Public email/}), 'r@example.com{Enter}')
    expect(await screen.findByText('Team saved.')).toBeInTheDocument()
    expect(server.payloads('/TeamUpdate')).toEqual([
      {
        teamId: team.id,
        name: 'Red Rocketeers',
        color: TEAM_COLORS[0],
        phone: '0400 111 222',
        email: 'r@example.com',
        division: 1,
      },
    ])
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({name: 'Red Rocketeers'}))
  })

  it('shows the roster on the members tab and hides the save button there', async () => {
    const team = makeTeam({name: 'Red Rockets'})
    const server = mockServer({
      '/MemberListOfTeam': () => ({members: [], users: []}),
    })
    const {user, dialog} = renderAdmin(team)
    expect(dialog).toHaveAccessibleDescription('No division')
    await user.click(within(dialog).getByRole('tab', {name: 'Team members'}))
    expect(await within(dialog).findByText('No members yet')).toBeInTheDocument()
    expect(server.payloads('/MemberListOfTeam')).toEqual([team.id])
    expect(within(dialog).queryByRole('button', {name: 'Save changes'})).not.toBeInTheDocument()
  })

  it('deletes the team after confirmation', async () => {
    const team = makeTeam({name: 'Red Rockets'})
    const server = mockServer({'/TeamDelete': () => undefined})
    const {user, dialog, onDeleted} = renderAdmin(team)
    await user.click(within(dialog).getByRole('button', {name: 'Delete'}))
    const confirm = await screen.findByRole('dialog', {name: 'Delete Red Rockets?'})
    await user.click(within(confirm).getByRole('button', {name: 'Delete team'}))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(server.payloads('/TeamDelete')).toEqual([{teamId: team.id}])
    expect(await screen.findByText('Red Rockets deleted.')).toBeInTheDocument()
  })

  it('keeps the delete confirmation open when the server refuses', async () => {
    const team = makeTeam({name: 'Red Rockets'})
    mockServer({
      '/TeamDelete': () => {
        throw serverError(409, 'This team has reports and can’t be deleted.')
      },
    })
    const {user, dialog, onDeleted} = renderAdmin(team)
    await user.click(within(dialog).getByRole('button', {name: 'Delete'}))
    const confirm = await screen.findByRole('dialog', {name: 'Delete Red Rockets?'})
    await user.click(within(confirm).getByRole('button', {name: 'Delete team'}))
    expect(await screen.findByText('This team has reports and can’t be deleted.')).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', {name: 'Delete Red Rockets?'})).toBeInTheDocument()
  })
})

describe('TeamCurrentCreateDialog', () => {
  it('creates a team for the signed in player with name and colour only', async () => {
    const season = makeSeason({name: 'Winter 2026', signUpOpen: false})
    const team = makeTeam({seasonId: season.id, name: 'New Kids'})
    const server = mockServer({
      '/TeamCurrentCreate': () => ({team, member: {}}),
    })
    const onCreated = vi.fn()
    const {user} = renderScreen(
      <TeamCurrentCreateDialog open onOpenChange={vi.fn()} onCreated={onCreated} />,
      {auth: makeAuth(), context: {season}},
    )
    const dialog = screen.getByRole('dialog', {name: 'New team'})
    expect(within(dialog).getByText('Team sign-ups for Winter 2026 are currently closed.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox', {name: /Public email/})).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', {name: 'Create team'}))
    expect(within(dialog).getByText('Give the team a name.')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', {name: 'Team name'}), 'New Kids')
    await user.click(within(dialog).getByRole('button', {name: 'Create team'}))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(team))
    expect(server.payloads('/TeamCurrentCreate')).toEqual([
      {seasonId: season.id, name: 'New Kids', color: TEAM_COLORS[0]},
    ])
  })
})
