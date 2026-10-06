import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {TAuth} from '../../core/auth/AuthContext'
import {makeAuth, makeTeam} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError, THandler} from '../../test/server'
import {findDialog, makeMember, setupUser} from '../seasons/screenTestUtils'
import {SettingsDialog} from './SettingsDialog'

const memberList = (auth: TAuth, captain: boolean): THandler => () => {
  const current = makeMember({userId: auth.userId, teamId: auth.team?.id, captain})
  return {current, members: [current], users: [auth.user]}
}

const renderSettings = (
  auth: TAuth,
  handlers: Record<string, THandler> = {},
  initialTab?: string,
) => {
  const server = mockServer({
    '/SeasonDeleteStatus': () => ({canDelete: false}),
    ...handlers,
  })
  const onOpenChange = vi.fn<(open: boolean) => void>()
  renderApp(
    <SettingsDialog open onOpenChange={onOpenChange} initialTab={initialTab} />,
    {auth},
  )
  return {server, onOpenChange}
}

const tabNames = (modal: HTMLElement) =>
  within(within(modal).getByRole('tablist', {name: 'Settings sections'}))
    .getAllByRole('tab')
    .map((t) => t.textContent)

describe('SettingsDialog', () => {
  it('gives a player without a team account and password tabs', async () => {
    const {server} = renderSettings(makeAuth())
    const modal = await findDialog('Settings')
    expect(tabNames(modal)).toEqual(['Account', 'Change password'])
    expect(within(modal).getByText('Player')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
  })

  it('shows members but not team settings to a regular team member', async () => {
    const team = makeTeam()
    const auth = makeAuth({team})
    const {server} = renderSettings(auth, {'/MemberListOfTeam': memberList(auth, false)})
    const modal = await findDialog('Settings')
    await waitFor(() =>
      expect(tabNames(modal)).toEqual(['Account', 'Change password', 'Members']),
    )
    expect(within(modal).getByText('Player')).toBeInTheDocument()
    expect(server.payloads('/MemberListOfTeam')[0]).toBe(team.id)
  })

  it('adds the team tab and captain role for captains', async () => {
    const user = setupUser()
    const team = makeTeam({name: 'Skyhawks'})
    const auth = makeAuth({team})
    renderSettings(auth, {'/MemberListOfTeam': memberList(auth, true)})
    const modal = await findDialog('Settings')
    expect(await within(modal).findByText('Team captain')).toBeInTheDocument()
    expect(tabNames(modal)).toEqual(['Account', 'Change password', 'Team', 'Members'])
    await user.click(within(modal).getByRole('tab', {name: 'Team'}))
    expect(within(modal).getByLabelText('Team name')).toHaveValue('Skyhawks')
    await user.click(within(modal).getByRole('tab', {name: 'Change password'}))
    expect(within(modal).getByLabelText('Old password')).toBeInTheDocument()
  })

  it('opens on the team tab once captain status is known', async () => {
    const team = makeTeam({name: 'Skyhawks'})
    const auth = makeAuth({team})
    renderSettings(auth, {'/MemberListOfTeam': memberList(auth, true)}, 'team')
    const modal = await findDialog('Settings')
    expect(await within(modal).findByLabelText('Team name')).toHaveValue('Skyhawks')
    expect(within(modal).getByRole('tab', {name: 'Team'})).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('falls back to members when a non-captain asks for the team tab', async () => {
    const team = makeTeam()
    const auth = makeAuth({team})
    renderSettings(auth, {'/MemberListOfTeam': memberList(auth, false)}, 'team')
    const modal = await findDialog('Settings')
    await waitFor(() =>
      expect(within(modal).getByRole('tab', {name: 'Members'})).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
  })

  it('gives admins the season tab and team settings even if the roster fails', async () => {
    const user = setupUser()
    const team = makeTeam()
    const auth = makeAuth({team, user: {admin: true}})
    renderSettings(auth, {
      '/MemberListOfTeam': () => {
        throw serverError(500, 'Roster unavailable.')
      },
    })
    const modal = await findDialog('Settings')
    expect(within(modal).getByText('Administrator')).toBeInTheDocument()
    await waitFor(() =>
      expect(tabNames(modal)).toEqual([
        'Account',
        'Change password',
        'Team',
        'Members',
        'Season',
      ]),
    )
    await user.click(within(modal).getByRole('tab', {name: 'Season'}))
    expect(within(modal).getByLabelText('Scoring system')).toBeInTheDocument()
  })

  it('closes from the close button', async () => {
    const user = setupUser()
    const {onOpenChange} = renderSettings(makeAuth())
    const modal = await findDialog('Settings')
    await user.click(within(modal).getByRole('button', {name: 'Close'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog', {name: 'Settings'})).toBeInTheDocument()
  })
})
