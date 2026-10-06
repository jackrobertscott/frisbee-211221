import {TUserSafe} from '@shared/schemas/ioUser'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {makeAuth} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError, THandler} from '../../test/server'
import {
  chooseOption,
  findDialog,
  setupUser,
  spyToasts,
} from '../seasons/screenTestUtils'
import {AccountSettings} from './AccountSettings'

const DATE = '2026-01-01T00:00:00.000Z'

const renderAccount = (
  emails: TUserSafe['emails'] = [
    {value: 'me@example.com', verified: true, primary: true, createdOn: DATE},
  ],
  handlers: Record<string, THandler> = {},
) => {
  const auth = makeAuth({user: {firstName: 'Sam', lastName: 'Stone', genderMatching: 'male', emails}})
  const server = mockServer(handlers)
  const view = renderApp(<AccountSettings role="Team captain" />, {auth})
  return {...view, server, auth}
}

const threeEmails: TUserSafe['emails'] = [
  {value: 'me@example.com', verified: true, primary: true, createdOn: DATE},
  {value: 'alt@example.com', verified: true, primary: false, createdOn: DATE},
  {value: 'new@example.com', verified: false, primary: false, createdOn: DATE},
]

const typeCode = async (user: ReturnType<typeof setupUser>, scope: HTMLElement, code: string) => {
  await user.click(within(scope).getByLabelText('Character 1 of 8'))
  await user.keyboard(code)
}

describe('AccountSettings profile', () => {
  it('shows the profile with its role and saves changes', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {server, context, auth} = renderAccount(undefined, {
      '/UserCurrentUpdate': (payload) => ({...auth.user, ...(payload as Partial<TUserSafe>)}),
    })
    expect(screen.getByText('Sam Stone')).toBeInTheDocument()
    expect(screen.getByText('Team captain')).toBeInTheDocument()
    expect(screen.getByLabelText('First name')).toHaveValue('Sam')
    await user.clear(screen.getByLabelText('First name'))
    await user.type(screen.getByLabelText('First name'), 'Samantha')
    await chooseOption(user, 'Gender matching', 'Female')
    await user.click(screen.getByRole('button', {name: 'Save'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Account updated.'))
    expect(server.payloads('/UserCurrentUpdate')).toEqual([
      {firstName: 'Samantha', lastName: 'Stone', genderMatching: 'female'},
    ])
    expect(context.userSet).toHaveBeenCalledWith(
      expect.objectContaining({firstName: 'Samantha', genderMatching: 'female'}),
    )
  })

  it('renders nothing when signed out', () => {
    mockServer()
    const {container} = renderApp(<AccountSettings role="Player" />, {shell: false})
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AccountSettings emails', () => {
  it('does not allow removing the only email', () => {
    renderAccount()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Remove me@example.com'})).toBeDisabled()
    expect(screen.queryByRole('button', {name: /as primary/})).not.toBeInTheDocument()
  })

  it('adds an email then verifies it with the emailed code', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {server, context, auth} = renderAccount(undefined, {
      '/UserCurrentEmailAdd': () => auth.user,
      '/UserCurrentEmailVerify': () => auth.user,
      '/UserCurrentEmailCodeResend': () => auth.user,
    })
    await user.click(screen.getByRole('button', {name: 'Add email'}))
    const add = await findDialog('New email')
    await user.type(within(add).getByLabelText('Email'), ' new@example.com ')
    await user.click(within(add).getByRole('button', {name: 'Add email'}))
    const verify = await findDialog('Verify email')
    expect(server.payloads('/UserCurrentEmailAdd')).toEqual([{email: 'new@example.com'}])
    expect(context.userSet).toHaveBeenCalledWith(auth.user)
    expect(within(verify).getByText('new@example.com')).toBeInTheDocument()

    await user.click(within(verify).getByRole('button', {name: 'Resend code'}))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Code sent to your inbox.'),
    )
    expect(server.payloads('/UserCurrentEmailCodeResend')).toEqual([
      {email: 'new@example.com'},
    ])

    const submit = within(verify).getByRole('button', {name: 'Verify'})
    expect(submit).toBeDisabled()
    await typeCode(user, verify, 'abcd1234')
    await user.click(submit)
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Email verified.'))
    expect(server.payloads('/UserCurrentEmailVerify')).toEqual([
      {email: 'new@example.com', code: 'ABCD1234'},
    ])
    await waitFor(() =>
      expect(screen.queryByRole('dialog', {name: 'Verify email'})).not.toBeInTheDocument(),
    )
  })

  it('keeps the verify dialog open on a wrong code', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    renderAccount(threeEmails, {
      '/UserCurrentEmailVerify': () => {
        throw serverError(400, 'That code is not valid.')
      },
    })
    expect(screen.getByText('Unverified')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Verify'}))
    const verify = await findDialog('Verify email')
    await typeCode(user, verify, 'ZZZZ0000')
    await user.click(within(verify).getByRole('button', {name: 'Verify'}))
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('That code is not valid.'))
    expect(verify).toBeInTheDocument()
    await user.click(within(verify).getByRole('button', {name: 'Cancel'}))
    await waitFor(() => expect(verify).not.toBeInTheDocument())
  })

  it('removes an email after confirming', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {server, auth} = renderAccount(threeEmails, {
      '/UserCurrentEmailRemove': () => auth.user,
    })
    await user.click(screen.getByRole('button', {name: 'Remove alt@example.com'}))
    const confirm = await findDialog('Remove email')
    await user.click(within(confirm).getByRole('button', {name: 'Delete'}))
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Email removed from account.'),
    )
    expect(server.payloads('/UserCurrentEmailRemove')).toEqual([{email: 'alt@example.com'}])
  })

  it('sets a verified email as primary', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const {server, auth} = renderAccount(threeEmails, {
      '/UserCurrentEmailPrimarySet': () => auth.user,
    })
    expect(
      screen.queryByRole('button', {name: 'Set new@example.com as primary'}),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Set alt@example.com as primary'}))
    const confirm = await findDialog('Set as primary')
    await user.click(within(confirm).getByRole('button', {name: 'Set as primary'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Email set as primary.'))
    expect(server.payloads('/UserCurrentEmailPrimarySet')).toEqual([
      {email: 'alt@example.com'},
    ])
  })
})
