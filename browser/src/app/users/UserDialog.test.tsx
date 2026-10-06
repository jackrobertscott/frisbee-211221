import {TUserSafe} from '@shared/schemas/ioUser'
import {screen, waitFor, within} from '@testing-library/react'
import {useState} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam, makeUser} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError, THandler} from '../../test/server'
import {
  chooseOption,
  findDialog,
  makeMember,
  setupUser,
  spyToasts,
} from '../seasons/screenTestUtils'
import {UserDialog} from './UserDialog'

const DATE = '2026-01-01T00:00:00.000Z'

const twoEmails = () =>
  makeUser({
    firstName: 'Kim',
    lastName: 'Lee',
    genderMatching: 'female',
    emails: [
      {value: 'kim@example.com', verified: true, primary: true, createdOn: DATE},
      {value: 'kim@work.com', verified: false, primary: false, createdOn: DATE},
    ],
  })

/** Holds the user like UsersPage does, applying server updates. */
function Harness({
  initial,
  onUserChange,
  onClose,
}: {
  initial: TUserSafe
  onUserChange: (user: TUserSafe) => void
  onClose: () => void
}) {
  const [user, userSet] = useState<TUserSafe | undefined>(initial)
  return (
    <UserDialog
      user={user}
      onClose={() => {
        userSet(undefined)
        onClose()
      }}
      onUserChange={(next) => {
        userSet(next)
        onUserChange(next)
      }}
    />
  )
}

const renderDialog = (
  initial: TUserSafe,
  handlers: Record<string, THandler> = {},
  auth = makeAuth({user: {admin: true}}),
) => {
  const server = mockServer({
    '/FeatureDashboardUserMembershipsLoad': () => ({members: [], seasons: [], teams: []}),
    ...handlers,
  })
  const onUserChange = vi.fn<(user: TUserSafe) => void>()
  const onClose = vi.fn<() => void>()
  const view = renderApp(
    <Harness initial={initial} onUserChange={onUserChange} onClose={onClose} />,
    {auth},
  )
  return {...view, server, onUserChange, onClose}
}

describe('UserDialog details', () => {
  it('shows the user and saves profile changes', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const kim = twoEmails()
    const {server, onUserChange} = renderDialog(kim, {
      '/UserUpdate': (payload) => ({...kim, ...(payload as Partial<TUserSafe>)}),
    })
    const modal = await findDialog(/Kim Lee/)
    expect(within(modal).getByText('kim@example.com', {selector: 'p'})).toBeInTheDocument()
    const save = within(modal).getByRole('button', {name: 'Save changes'})
    expect(save).toBeDisabled()
    await user.clear(within(modal).getByLabelText('First name'))
    await user.type(within(modal).getByLabelText('First name'), 'Kimberly')
    await chooseOption(user, 'Gender matching', 'Male')
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('User saved'))
    expect(server.payloads('/UserUpdate')).toEqual([
      {
        userId: kim.id,
        firstName: 'Kimberly',
        lastName: 'Lee',
        genderMatching: 'male',
      },
    ])
    expect(onUserChange).toHaveBeenCalledWith(
      expect.objectContaining({firstName: 'Kimberly', genderMatching: 'male'}),
    )
    await waitFor(() => expect(save).toBeDisabled())
  })

  it('updates the signed in user when editing yourself', async () => {
    const user = setupUser()
    const auth = makeAuth({user: {admin: true, firstName: 'Me'}})
    const {context} = renderDialog(
      auth.user,
      {'/UserUpdate': (payload) => ({...auth.user, ...(payload as Partial<TUserSafe>)})},
      auth,
    )
    const modal = await findDialog(/Me Player/)
    await user.type(within(modal).getByLabelText('Last name'), 's')
    await user.click(within(modal).getByRole('button', {name: 'Save changes'}))
    await waitFor(() =>
      expect(context.userSet).toHaveBeenCalledWith(
        expect.objectContaining({lastName: 'Players'}),
      ),
    )
  })

  it('saves profile changes when pressing Enter in a field', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const kim = twoEmails()
    const {server} = renderDialog(kim, {
      '/UserUpdate': (payload) => ({...kim, ...(payload as Partial<TUserSafe>)}),
    })
    const modal = await findDialog(/Kim Lee/)
    const lastName = within(modal).getByLabelText('Last name')
    await user.type(lastName, '{Enter}')
    expect(server.payloads('/UserUpdate')).toEqual([])
    await user.type(lastName, 'son{Enter}')
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('User saved'))
    expect(server.payloads('/UserUpdate')).toEqual([
      expect.objectContaining({userId: kim.id, firstName: 'Kim', lastName: 'Leeson'}),
    ])
  })

  it('closes from the footer', async () => {
    const user = setupUser()
    const {onClose} = renderDialog(twoEmails())
    const modal = await findDialog(/Kim Lee/)
    const [footerClose] = within(modal).getAllByRole('button', {name: 'Close'})
    await user.click(footerClose)
    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(modal).not.toBeInTheDocument())
  })
})

describe('UserDialog emails', () => {
  it('adds an email', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const kim = twoEmails()
    const added = {
      ...kim,
      emails: [
        ...kim.emails,
        {value: 'kim@new.com', verified: false, primary: false, createdOn: DATE},
      ],
    }
    const {server} = renderDialog(kim, {'/UserEmailAdd': () => added})
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('button', {name: 'Add email'}))
    const add = await findDialog('New email')
    await user.type(within(add).getByLabelText('Email'), 'kim@new.com')
    await user.click(within(add).getByRole('button', {name: 'Add email'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Email added to account.'))
    expect(server.payloads('/UserEmailAdd')).toEqual([
      {userId: kim.id, email: 'kim@new.com'},
    ])
    expect(await within(modal).findByText('kim@new.com')).toBeInTheDocument()
  })

  it('keeps the add email dialog open when the server rejects it', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    renderDialog(twoEmails(), {
      '/UserEmailAdd': () => {
        throw serverError(409, 'Email already in use.')
      },
    })
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('button', {name: 'Add email'}))
    const add = await findDialog('New email')
    await user.type(within(add).getByLabelText('Email'), 'taken@example.com{Enter}')
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Email already in use.'))
    expect(add).toBeInTheDocument()
  })

  it('removes an email after confirming', async () => {
    const user = setupUser()
    const kim = twoEmails()
    const {server, onUserChange} = renderDialog(kim, {
      '/UserEmailRemove': () => ({...kim, emails: kim.emails.slice(0, 1)}),
    })
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('button', {name: 'Remove kim@work.com'}))
    const confirm = await findDialog('Remove email')
    expect(within(confirm).getByText(/"kim@work.com" to be removed/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', {name: 'Delete'}))
    await waitFor(() =>
      expect(server.payloads('/UserEmailRemove')).toEqual([
        {userId: kim.id, email: 'kim@work.com'},
      ]),
    )
    expect(onUserChange).toHaveBeenCalled()
    await waitFor(() => expect(within(modal).queryByText('kim@work.com')).not.toBeInTheDocument())
    expect(within(modal).getByRole('button', {name: 'Remove kim@example.com'})).toBeDisabled()
  })

  it('makes an email primary', async () => {
    const user = setupUser()
    const kim = twoEmails()
    const {server} = renderDialog(kim, {'/UserEmailPrimarySet': () => kim})
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('button', {name: 'Make primary'}))
    const confirm = await findDialog('Set as primary')
    await user.click(within(confirm).getByRole('button', {name: 'Set as primary'}))
    await waitFor(() =>
      expect(server.payloads('/UserEmailPrimarySet')).toEqual([
        {userId: kim.id, email: 'kim@work.com'},
      ]),
    )
  })

  it.each([
    ['Verified', 'Mark email as unverified', 'Mark as unverified', 'kim@example.com', false],
    ['Unverified', 'Mark email as verified', 'Mark as verified', 'kim@work.com', true],
  ])(
    'toggles a %s email',
    async (button, title, confirmLabel, email, verified) => {
      const user = setupUser()
      const toasts = spyToasts()
      const kim = twoEmails()
      const {server} = renderDialog(kim, {'/UserEmailVerifiedSet': () => kim})
      const modal = await findDialog(/Kim Lee/)
      await user.click(within(modal).getByRole('button', {name: button}))
      const confirm = await findDialog(title)
      await user.click(within(confirm).getByRole('button', {name: confirmLabel}))
      await waitFor(() =>
        expect(server.payloads('/UserEmailVerifiedSet')).toEqual([
          {userId: kim.id, email, verified},
        ]),
      )
      expect(toasts.success).toHaveBeenCalledWith(
        verified ? 'Email marked as verified.' : 'Email marked as unverified.',
      )
    },
  )

  it('says when the user has no emails', async () => {
    renderDialog(makeUser({firstName: 'No', lastName: 'Mail', emails: []}))
    const modal = await findDialog(/No Mail/)
    expect(within(modal).getByText('No email')).toBeInTheDocument()
    expect(within(modal).getByText('This user has no email addresses.')).toBeInTheDocument()
  })
})

describe('UserDialog access', () => {
  it('promotes a user to admin', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const kim = twoEmails()
    const {server} = renderDialog(kim, {'/UserToggleAdmin': () => ({...kim, admin: true})})
    const modal = await findDialog(/Kim Lee/)
    expect(within(modal).getByText('No — regular league member.')).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', {name: 'Set as admin'}))
    const confirm = await findDialog('Set as admin')
    await user.click(within(confirm).getByRole('button', {name: 'Confirm'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('User is now an admin.'))
    expect(server.payloads('/UserToggleAdmin')).toEqual([{userId: kim.id}])
    expect(
      await within(modal).findByText('Yes — has access to admin privileges.'),
    ).toBeInTheDocument()
    expect(within(modal).getByRole('button', {name: 'Remove from admins'})).toBeInTheDocument()
  })

  it('removes an admin', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const kim = {...twoEmails(), admin: true}
    renderDialog(kim, {'/UserToggleAdmin': () => ({...kim, admin: false})})
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('button', {name: 'Remove from admins'}))
    const confirm = await findDialog('Remove from admins')
    expect(
      within(confirm).getByText('User will no longer have access to admin privileges.'),
    ).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', {name: 'Confirm'}))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('User removed from admins.'),
    )
  })

  it('changes the password', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const kim = twoEmails()
    const {server} = renderDialog(kim, {'/UserChangePassword': () => kim})
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('button', {name: 'Change password'}))
    const pass = await findDialog('Kim password')
    await user.type(within(pass).getByLabelText('New password'), 'n3w-pass')
    await user.click(within(pass).getByRole('button', {name: 'Change password'}))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith("Successfully updated Kim's password."),
    )
    expect(server.payloads('/UserChangePassword')).toEqual([
      {userId: kim.id, newPassword: 'n3w-pass'},
    ])
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Kim password'})).not.toBeInTheDocument(),
    )
  })
})

describe('UserDialog teams', () => {
  it('lists memberships by season then team with their status', async () => {
    const user = setupUser()
    const kim = twoEmails()
    const s2025 = makeSeason({name: 'Summer 2025'})
    const s2026 = makeSeason({name: 'Summer 2026'})
    const alpha = makeTeam({name: 'Alpha'})
    const zulu = makeTeam({name: 'Zulu'})
    const {server} = renderDialog(kim, {
      '/FeatureDashboardUserMembershipsLoad': () => ({
        members: [
          makeMember({seasonId: s2026.id, teamId: zulu.id, pending: true}),
          makeMember({seasonId: s2026.id, teamId: alpha.id, captain: true}),
          makeMember({seasonId: s2025.id, teamId: testMissingTeam}),
        ],
        seasons: [s2025, s2026],
        teams: [alpha, zulu],
      }),
    })
    const modal = await findDialog(/Kim Lee/)
    expect(within(modal).queryByRole('table')).not.toBeInTheDocument()
    await user.click(within(modal).getByRole('tab', {name: 'Teams'}))
    expect(within(modal).queryByRole('button', {name: 'Save changes'})).not.toBeInTheDocument()
    const table = await within(modal).findByRole('table', {name: 'Team memberships'})
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      '[unknown]Summer 2025Member',
      'AlphaSummer 2026Captain',
      'ZuluSummer 2026Pending',
    ])
    expect(server.payloads('/FeatureDashboardUserMembershipsLoad')).toEqual([
      {userId: kim.id},
    ])
  })

  it('shows when the user has no teams', async () => {
    const user = setupUser()
    renderDialog(twoEmails())
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('tab', {name: 'Teams'}))
    expect(await within(modal).findByText('No teams')).toBeInTheDocument()
  })

  it('shows when memberships failed to load', async () => {
    const user = setupUser()
    spyToasts()
    renderDialog(twoEmails(), {
      '/FeatureDashboardUserMembershipsLoad': () => {
        throw serverError(500, 'Boom')
      },
    })
    const modal = await findDialog(/Kim Lee/)
    await user.click(within(modal).getByRole('tab', {name: 'Teams'}))
    expect(await within(modal).findByText('Couldn’t load teams')).toBeInTheDocument()
  })
})

const testMissingTeam = '00000000000000000000ffff'
