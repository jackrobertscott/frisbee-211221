import {TTeam} from '@shared/schemas/ioTeam'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError} from '../../test/server'
import {
  chooseOption,
  findDialog,
  setupUser,
  spyToasts,
} from '../seasons/screenTestUtils'
import {PasswordSettings, SeasonSettings, TeamSettings} from './OtherSettings'

describe('PasswordSettings', () => {
  it('flags mismatched passwords and blocks submit', async () => {
    const user = setupUser()
    const server = mockServer()
    renderApp(<PasswordSettings />, {auth: makeAuth()})
    await user.type(screen.getByLabelText('New password'), 'abcde')
    await user.type(screen.getByLabelText('Confirm new password'), 'abcdX')
    expect(screen.getByText('The new passwords don’t match.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Change password'})).toBeDisabled()
    await user.type(screen.getByLabelText('Confirm new password'), '{Enter}')
    expect(server.calls).toHaveLength(0)
  })

  it('changes the password and clears the form', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const auth = makeAuth()
    const server = mockServer({'/UserCurrentChangePassword': () => auth.user})
    renderApp(<PasswordSettings />, {auth})
    await user.type(screen.getByLabelText('Old password'), 'old-pass')
    await user.type(screen.getByLabelText('New password'), 'new-pass')
    await user.type(screen.getByLabelText('Confirm new password'), 'new-pass')
    await user.click(screen.getByRole('button', {name: 'Change password'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Password changed.'))
    expect(server.payloads('/UserCurrentChangePassword')).toEqual([
      {oldPassword: 'old-pass', newPassword: 'new-pass'},
    ])
    expect(server.calls[0].token).toBe(auth.token)
    expect(screen.getByLabelText('Old password')).toHaveValue('')
  })

  it('keeps the entered passwords when the old one is wrong', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    mockServer({
      '/UserCurrentChangePassword': () => {
        throw serverError(400, 'Your old password is incorrect.')
      },
    })
    renderApp(<PasswordSettings />, {auth: makeAuth()})
    await user.type(screen.getByLabelText('Old password'), 'nope')
    await user.type(screen.getByLabelText('New password'), 'new-pass')
    await user.click(screen.getByRole('button', {name: 'Change password'}))
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith('Your old password is incorrect.'),
    )
    expect(screen.getByLabelText('Old password')).toHaveValue('nope')
  })
})

describe('TeamSettings', () => {
  const captainAuth = (team: TTeam) => makeAuth({team})

  it('validates and saves the team details', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const team = makeTeam({name: 'Hucks', phone: '0400 000 000'})
    const updated = {...team, name: 'Huckers'}
    const server = mockServer({'/TeamCurrentUpdate': () => updated})
    const {context} = renderApp(<TeamSettings />, {auth: captainAuth(team)})
    const name = screen.getByLabelText('Team name')
    expect(name).toHaveValue('Hucks')
    await user.clear(name)
    await user.type(screen.getByLabelText(/Public email/), 'bad')
    await user.click(screen.getByRole('button', {name: 'Save'}))
    expect(screen.getByText('Give the team a name.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)

    await user.type(name, 'Huckers')
    await user.clear(screen.getByLabelText(/Public email/))
    await user.type(screen.getByLabelText(/Public email/), 'team@example.com')
    await user.click(screen.getByRole('button', {name: 'Save'}))
    await waitFor(() => expect(context.teamSet).toHaveBeenCalledWith(updated))
    expect(toasts.success).toHaveBeenCalledWith('Team updated.')
    expect(server.payloads('/TeamCurrentUpdate')).toEqual([
      {
        teamId: team.id,
        name: 'Huckers',
        color: team.color,
        phone: '0400 000 000',
        email: 'team@example.com',
      },
    ])
  })

  it('renders nothing without a team', () => {
    const {container} = renderApp(<TeamSettings />, {auth: makeAuth(), shell: false})
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SeasonSettings', () => {
  const admin = () => makeAuth({user: {admin: true}})

  it('saves the season settings', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const season = makeSeason({name: 'Summer', signUpOpen: true, genderDivision: 'mixed'})
    const updated = {...season, name: 'Summer A'}
    const server = mockServer({
      '/SeasonDeleteStatus': () => ({canDelete: false}),
      '/SeasonUpdate': () => updated,
    })
    const {context} = renderApp(<SeasonSettings />, {auth: admin(), context: {season}})
    expect(screen.getByLabelText('Scoring system')).toHaveValue('Simple')
    expect(screen.getByLabelText('Scoring system')).toBeDisabled()
    await user.type(screen.getByLabelText('Name'), ' A')
    await user.click(screen.getByRole('switch', {name: 'Hide from dashboard'}))
    await user.click(screen.getByRole('switch', {name: 'Sign up open'}))
    await chooseOption(user, 'Season type', 'Men’s')
    await user.click(screen.getByRole('button', {name: 'Save'}))
    await waitFor(() => expect(context.seasonSet).toHaveBeenCalledWith(updated, true))
    expect(toasts.success).toHaveBeenCalledWith('Season updated.')
    expect(server.payloads('/SeasonUpdate')).toEqual([
      {
        seasonId: season.id,
        name: 'Summer A',
        isHidden: true,
        signUpOpen: false,
        genderDivision: 'men',
      },
    ])
    expect(server.payloads('/SeasonDeleteStatus')).toEqual([{seasonId: season.id}])
    expect(screen.queryByRole('button', {name: 'Delete season'})).not.toBeInTheDocument()
  })

  it('shows official scoring as read only', () => {
    mockServer({'/SeasonDeleteStatus': () => ({canDelete: false})})
    renderApp(<SeasonSettings />, {
      auth: admin(),
      context: {season: makeSeason({useOfficialScoring: true})},
    })
    expect(screen.getByLabelText('Scoring system')).toHaveValue('Official')
  })

  it('deletes an empty season after entering the password', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const season = makeSeason({name: 'Empty'})
    localStorage.setItem('season', JSON.stringify(season.id))
    const server = mockServer({
      '/SeasonDeleteStatus': () => ({canDelete: true}),
      '/SeasonDelete': () => undefined,
    })
    renderApp(<SeasonSettings />, {auth: admin(), context: {season}})
    expect(
      await screen.findByText('Permanently removes Empty and everything in it.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Delete season'}))
    const modal = await findDialog('Delete Empty?')
    await user.type(within(modal).getByLabelText('Password'), 'pw')
    await user.click(within(modal).getByRole('button', {name: 'Delete season'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Season deleted.'))
    expect(server.payloads('/SeasonDelete')).toEqual([{seasonId: season.id, password: 'pw'}])
    expect(localStorage.getItem('season')).toBeNull()
  })

  it('keeps the delete dialog open on a wrong password', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const season = makeSeason({name: 'Empty'})
    mockServer({
      '/SeasonDeleteStatus': () => ({canDelete: true}),
      '/SeasonDelete': () => {
        throw serverError(400, 'Incorrect password.')
      },
    })
    renderApp(<SeasonSettings />, {auth: admin(), context: {season}})
    await user.click(await screen.findByRole('button', {name: 'Delete season'}))
    const modal = await findDialog('Delete Empty?')
    await user.type(within(modal).getByLabelText('Password'), 'bad{Enter}')
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Incorrect password.'))
    expect(modal).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', {name: 'Cancel'}))
    await waitFor(() => expect(modal).not.toBeInTheDocument())
  })
})
