import {screen, waitFor, within} from '@testing-library/react'
import {Toaster} from '@ui'
import {beforeEach, describe, expect, it} from 'vitest'
import {makeSeason, makeSession, makeUser} from '../../test/fixtures'
import {renderApp} from '../../test/render'
import {mockServer, serverError} from '../../test/server'
import {setupUser, spyToasts} from '../seasons/screenTestUtils'
import {AuthScreen} from './AuthScreen'

const SAVED_EMAIL_KEY = 'frisbee.savedEmail'
const season = makeSeason()

const renderAuth = (path: string) =>
  renderApp(
    <>
      <AuthScreen />
      <Toaster />
    </>,
    {path, context: {season}},
  )

/** Where `navigate()` sent the browser. */
const currentUrl = () => window.location.pathname + window.location.search

const authPayload = () => {
  const user = makeUser({firstName: 'Riley'})
  return {user, session: makeSession({userId: user.id})}
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('AuthScreen welcome step', () => {
  it('validates the email before checking its status', async () => {
    const user = setupUser()
    const server = mockServer()
    renderAuth('/auth/welcome')
    expect(screen.getByRole('heading', {name: 'Welcome'})).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', {name: 'Continue'}))
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
    await user.type(screen.getByLabelText('Email'), 'x')
    expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument()
  })

  it.each([
    ['good', '/auth/login'],
    ['unknown', '/auth/sign-up'],
    ['unverified', '/auth/verify?email=sam%40example.com&status=unverified'],
  ])('routes a %s account to %s and remembers the email', async (status, url) => {
    const user = setupUser()
    const server = mockServer({
      '/SecurityStatus': () => ({status, email: 'sam@example.com'}),
    })
    renderAuth('/auth/welcome')
    await user.type(screen.getByLabelText('Email'), ' sam@example.com ')
    await user.click(screen.getByRole('button', {name: 'Continue'}))
    await waitFor(() => expect(currentUrl()).toBe(url))
    expect(server.payloads('/SecurityStatus')).toEqual([{email: 'sam@example.com'}])
    expect(localStorage.getItem(SAVED_EMAIL_KEY)).toBe(JSON.stringify('sam@example.com'))
  })

  it('prefills the remembered email', () => {
    localStorage.setItem(SAVED_EMAIL_KEY, JSON.stringify('kept@example.com'))
    mockServer()
    renderAuth('/auth/welcome')
    expect(screen.getByLabelText('Email')).toHaveValue('kept@example.com')
  })
})

describe('AuthScreen login step', () => {
  it('logs in with the entered credentials', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const data = authPayload()
    localStorage.setItem(SAVED_EMAIL_KEY, JSON.stringify('riley@example.com'))
    const server = mockServer({'/SecurityLogin': () => data})
    const {context} = renderAuth('/auth/login')
    expect(screen.getByLabelText('Email')).toHaveValue('riley@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', {name: 'Log in'}))
    await waitFor(() => expect(context.login).toHaveBeenCalledWith(data))
    expect(server.payloads('/SecurityLogin')).toEqual([
      {
        email: 'riley@example.com',
        password: 'secret',
        userAgent: navigator.userAgent,
        seasonId: season.id,
      },
    ])
    expect(toasts.success).toHaveBeenCalledWith('Welcome back, Riley')
    expect(currentUrl()).toBe('/')
  })

  it('shows the server error and stays signed out on a bad password', async () => {
    const user = setupUser()
    mockServer({
      '/SecurityLogin': () => {
        throw serverError(401, 'Email or password is incorrect.')
      },
    })
    const {context} = renderAuth('/auth/login')
    await user.type(screen.getByLabelText('Email'), 'riley@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong{Enter}')
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
    expect(context.login).not.toHaveBeenCalled()
    expect(context.invalidate).not.toHaveBeenCalled()
  })

  it('links to forgot password with the typed email', async () => {
    const user = setupUser()
    mockServer()
    renderAuth('/auth/login')
    await user.type(screen.getByLabelText('Email'), 'a@b.co')
    await user.click(screen.getByRole('link', {name: 'Forgot password?'}))
    expect(currentUrl()).toBe('/auth/forgot-password?email=a%40b.co')
    await user.click(screen.getByRole('link', {name: 'Create an account'}))
    expect(currentUrl()).toBe('/auth/sign-up')
    await user.click(screen.getByRole('button', {name: 'Back to home'}))
    expect(currentUrl()).toBe('/')
  })
})

describe('AuthScreen sign up step', () => {
  const fill = async (
    user: ReturnType<typeof setupUser>,
    opts: {gender?: boolean; email?: string; terms?: boolean} = {},
  ) => {
    await user.type(screen.getByLabelText('First name'), 'Jo')
    await user.type(screen.getByLabelText('Last name'), 'Bloggs')
    if (opts.gender !== false) {
      await user.click(screen.getByRole('combobox', {name: 'Gender matching'}))
      await user.click(await screen.findByRole('option', {name: 'Female'}))
    }
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), opts.email ?? 'jo@example.com')
    if (opts.terms !== false)
      await user.click(
        screen.getByRole('checkbox', {name: 'I accept the terms and conditions'}),
      )
  }

  it('requires a name first', async () => {
    const user = setupUser()
    const server = mockServer()
    renderAuth('/auth/sign-up')
    await user.click(screen.getByRole('button', {name: 'Sign up'}))
    expect(screen.getByText('Enter your first and last name.')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
  })

  it.each([
    [{gender: false}, 'Please select your gender matching.'],
    [{email: 'nope'}, 'Enter a valid email address.'],
    [{terms: false}, 'Please accept the terms and conditions to continue.'],
  ])('blocks submit when %o', async (opts, message) => {
    const user = setupUser()
    const server = mockServer()
    renderAuth('/auth/sign-up')
    await fill(user, opts)
    await user.click(screen.getByRole('button', {name: 'Sign up'}))
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
  })

  it('creates the account and asks the user to verify', async () => {
    const user = setupUser()
    const server = mockServer({'/SecuritySignUp': () => authPayload()})
    renderAuth('/auth/sign-up')
    await fill(user, {email: ' jo@example.com '})
    await user.click(screen.getByRole('button', {name: 'Sign up'}))
    await waitFor(() =>
      expect(currentUrl()).toBe('/auth/verify?email=jo%40example.com&status=password'),
    )
    expect(server.payloads('/SecuritySignUp')).toEqual([
      {
        firstName: 'Jo',
        lastName: 'Bloggs',
        email: 'jo@example.com',
        genderMatching: 'female',
        termsAccepted: true,
        seasonId: season.id,
        userAgent: navigator.userAgent,
      },
    ])
    expect(await screen.findByText('Please check your email inbox.')).toBeInTheDocument()
    expect(localStorage.getItem(SAVED_EMAIL_KEY)).toBe(JSON.stringify('jo@example.com'))
  })
})

describe('AuthScreen forgot password step', () => {
  it('prefills the email from the link and sends a reset code', async () => {
    const user = setupUser()
    const server = mockServer({'/SecurityForgot': () => undefined})
    renderAuth('/auth/forgot-password?email=sam%40example.com')
    expect(screen.getByRole('heading', {name: 'Forgot password'})).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('sam@example.com')
    await user.click(screen.getByRole('button', {name: 'Send code'}))
    await waitFor(() =>
      expect(currentUrl()).toBe(
        '/auth/verify?email=sam%40example.com&status=password&reason=reset',
      ),
    )
    expect(server.payloads('/SecurityForgot')).toEqual(['sam@example.com'])
  })

  it('validates the email', async () => {
    const user = setupUser()
    const server = mockServer()
    renderAuth('/auth/forgot-password')
    await user.click(screen.getByRole('button', {name: 'Send code'}))
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
  })
})

describe('AuthScreen verify step', () => {
  const typeCode = async (user: ReturnType<typeof setupUser>, code: string) => {
    const group = screen.getByRole('group', {name: 'Verification code'})
    await user.click(within(group).getByLabelText('Character 1 of 8'))
    await user.keyboard(code)
  }

  it('resets the password with the emailed code', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const data = authPayload()
    const server = mockServer({'/SecurityVerify': () => data})
    const {context} = renderAuth(
      '/auth/verify?email=sam%40example.com&status=password&reason=reset',
    )
    expect(screen.getByRole('heading', {name: 'Reset your password'})).toBeInTheDocument()
    expect(screen.getByText('sam@example.com')).toBeInTheDocument()
    const submit = screen.getByRole('button', {name: 'Submit & log in'})
    expect(submit).toBeDisabled()
    await typeCode(user, 'abcd1234')
    await user.type(screen.getByLabelText('New password'), 'hunter22')
    expect(submit).toBeEnabled()
    await user.click(submit)
    await waitFor(() => expect(context.login).toHaveBeenCalledWith(data))
    expect(server.payloads('/SecurityVerify')).toEqual([
      {
        email: 'sam@example.com',
        code: 'ABCD1234',
        newPassword: 'hunter22',
        userAgent: navigator.userAgent,
        seasonId: season.id,
      },
    ])
    expect(toasts.success).toHaveBeenCalledWith('Password updated')
    expect(currentUrl()).toBe('/')
  })

  it('verifies an email without asking for a password', async () => {
    const user = setupUser()
    const toasts = spyToasts()
    const server = mockServer({'/SecurityVerify': () => authPayload()})
    renderAuth('/auth/verify?email=sam%40example.com&status=unverified')
    expect(screen.getByRole('heading', {name: 'Verify your email'})).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    await typeCode(user, 'ABCD1234')
    await user.click(screen.getByRole('button', {name: 'Submit & log in'}))
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Email verified'))
    expect(server.payloads('/SecurityVerify')).toEqual([
      expect.objectContaining({code: 'ABCD1234', newPassword: ''}),
    ])
  })

  it('resends the code', async () => {
    const user = setupUser()
    const server = mockServer({'/SecurityForgot': () => undefined})
    renderAuth('/auth/verify?email=sam%40example.com&status=password')
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    await user.click(screen.getByRole('link', {name: 'Resend code'}))
    await waitFor(() =>
      expect(server.payloads('/SecurityForgot')).toEqual(['sam@example.com']),
    )
  })

  it('shows an invalid code error', async () => {
    const user = setupUser()
    mockServer({
      '/SecurityVerify': () => {
        throw serverError(400, 'That code is not valid.')
      },
    })
    const {context} = renderAuth('/auth/verify?email=sam%40example.com&status=unverified')
    await typeCode(user, 'ZZZZ9999')
    await user.click(screen.getByRole('button', {name: 'Submit & log in'}))
    expect(await screen.findByText('That code is not valid.')).toBeInTheDocument()
    expect(context.login).not.toHaveBeenCalled()
  })

  it('sends visitors without an email back to the start', async () => {
    mockServer()
    renderAuth('/auth/verify')
    await waitFor(() => expect(currentUrl()).toBe('/auth'))
  })
})
