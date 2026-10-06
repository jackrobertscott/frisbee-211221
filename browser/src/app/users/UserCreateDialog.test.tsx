import {TUserSafe} from '@shared/schemas/ioUser'
import {screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {makeAuth, makeUser} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer} from '../../test/server'
import {
  chooseOption,
  dialog,
  setupUser,
  spyToasts,
  userError,
} from '../seasons/screenTestUtils'
import {UserCreateDialog} from './UserCreateDialog'

const renderDialog = () => {
  const onOpenChange = vi.fn<(open: boolean) => void>()
  const onCreated = vi.fn<(user: TUserSafe) => void>()
  renderApp(
    <UserCreateDialog open onOpenChange={onOpenChange} onCreated={onCreated} />,
    {auth: makeAuth({user: {admin: true}})},
  )
  return {onOpenChange, onCreated, modal: dialog('Create user')}
}

describe('UserCreateDialog', () => {
  it('requires a gender matching', async () => {
    const user = setupUser()
    const server = mockServer()
    const {modal} = renderDialog()
    await user.type(within(modal).getByLabelText('First name'), 'Dee')
    await user.click(within(modal).getByRole('button', {name: 'Create user'}))
    expect(within(modal).getByText('Choose a gender matching.')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
    await chooseOption(user, 'Gender matching', 'Male')
    expect(within(modal).queryByText('Choose a gender matching.')).not.toBeInTheDocument()
  })

  it('creates the user with the entered details', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const created = makeUser({firstName: 'Dee', lastName: 'Dunn'})
    const server = mockServer({'/UserCreate': () => created})
    const {modal, onCreated, onOpenChange} = renderDialog()
    await user.type(within(modal).getByLabelText('First name'), 'Dee')
    await user.type(within(modal).getByLabelText('Last name'), 'Dunn')
    await user.type(within(modal).getByLabelText('Email'), 'dee@example.com')
    await chooseOption(user, 'Gender matching', 'Male')
    await user.click(within(modal).getByRole('switch', {name: 'T&Cs accepted'}))
    await user.click(within(modal).getByRole('button', {name: 'Create user'}))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    expect(server.payloads('/UserCreate')).toEqual([
      {
        firstName: 'Dee',
        lastName: 'Dunn',
        email: 'dee@example.com',
        genderMatching: 'male',
        termsAccepted: true,
      },
    ])
    expect(toasts.success).toHaveBeenCalledWith('Dee Dunn created')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays open when the email is taken', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    mockServer({
      '/UserCreate': () => {
        throw userError(409, 'That email is already in use.')
      },
    })
    const {modal, onCreated, onOpenChange} = renderDialog()
    await chooseOption(user, 'Gender matching', 'Female')
    await user.click(within(modal).getByRole('button', {name: 'Create user'}))
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith('That email is already in use.'),
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', {name: 'Cancel'}))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
