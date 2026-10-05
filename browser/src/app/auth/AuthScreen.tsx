import {TUserGender} from '@shared/schemas/ioUserGender'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  Heading,
  Input,
  Link,
  PinInput,
  Select,
  Stack,
  Text,
  toast,
} from '@ui'
import {ArrowLeft, KeyRound, Mail, MailCheck} from 'lucide-react'
import {type FormEvent, type ReactNode, useEffect, useState} from 'react'
import {config} from '../../config'
import {useAuth} from '../../core/auth/useAuth'
import {Router} from '../../core/router/Router'
import {useRouter} from '../../core/router/useRouter'
import {useEndpoint} from '../../core/useEndpoint'
import {useLocalState} from '../../core/useLocalState'
import {
  $SecurityForgot,
  $SecurityLogin,
  $SecuritySignUp,
  $SecurityStatus,
  $SecurityVerify,
} from '../../endpoints/Security'
import {GENDER_OPTIONS} from '../../utils/constants'
import {go} from '../../utils/go'
import {Logo} from '../Logo'

const SAVED_EMAIL_KEY = 'frisbee.savedEmail'
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const CODE_LENGTH = 8

const verifyUrl = (email: string, status: string, reason?: 'reset') =>
  `/auth/verify?email=${encodeURIComponent(email)}&status=${encodeURIComponent(status)}` +
  (reason ? `&reason=${reason}` : '')

/** Welcome → Login / Sign up → Verify email, plus Forgot password. Routed under /auth. */
export function AuthScreen() {
  const [savedEmail, savedEmailSet] = useLocalState(SAVED_EMAIL_KEY, '')
  const router = useRouter()
  const queryEmail = router.query.email
  return (
    <div className="fr-auth">
      <div className="fr-auth__inner">
        <a
          className="fr-auth__brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            go.to('/')
          }}
        >
          <Stack align="center" gap={3}>
            <Logo size={config.leagueKey === 'marlow' ? 64 : 88} />
            <Text weight="semibold">{config.title}</Text>
          </Stack>
        </a>
        <Card padding="lg" className="fr-auth__card">
          <Router
            prefix="/auth"
            fallback="/welcome"
            routes={[
              {
                path: '/welcome',
                render: () => (
                  <WelcomeStep
                    email={savedEmail ?? ''}
                    onStatus={(data) => {
                      savedEmailSet(data.email)
                      if (data.status === 'good') go.to('/auth/login')
                      else if (data.status === 'unknown') go.to('/auth/sign-up')
                      else go.to(verifyUrl(data.email, data.status))
                    }}
                  />
                ),
              },
              {
                path: '/login',
                render: () => (
                  <LoginStep
                    email={savedEmail ?? ''}
                    savedEmailSet={savedEmailSet}
                  />
                ),
              },
              {
                path: '/sign-up',
                render: () => (
                  <SignUpStep
                    email={savedEmail ?? ''}
                    savedEmailSet={savedEmailSet}
                  />
                ),
              },
              {
                path: '/forgot-password',
                render: () => (
                  <ForgotStep email={queryEmail ?? savedEmail ?? ''} />
                ),
              },
              {
                path: '/verify',
                render: () => (
                  <VerifyStep
                    email={queryEmail ?? savedEmail ?? ''}
                    status={router.query.status}
                    reset={router.query.reason === 'reset'}
                    savedEmailSet={savedEmailSet}
                  />
                ),
              },
            ]}
          />
        </Card>
        <Button
          variant="ghost"
          size="sm"
          leading={<ArrowLeft />}
          onClick={() => go.to('/')}
          className="fr-auth__back"
        >
          Back to home
        </Button>
      </div>
    </div>
  )
}

function StepHeader({
  icon,
  title,
  description,
}: {
  icon?: ReactNode
  title: string
  description: ReactNode
}) {
  return (
    <Stack gap={4}>
      {icon && <span className="ui-icon-tile">{icon}</span>}
      <Stack gap={1}>
        <Heading level={1} size="xl">
          {title}
        </Heading>
        <Text size="sm" tone="tertiary">
          {description}
        </Text>
      </Stack>
    </Stack>
  )
}

const linkTo = (href: string) => ({
  href,
  onClick: (e: React.MouseEvent) => {
    e.preventDefault()
    go.to(href)
  },
})

function WelcomeStep({
  email: initialEmail,
  onStatus,
}: {
  email: string
  onStatus: (data: {status: string; email: string}) => void
}) {
  const $status = useEndpoint($SecurityStatus)
  const [email, emailSet] = useState(initialEmail)
  const [error, errorSet] = useState<string>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!isEmail(email)) return errorSet('Enter a valid email address.')
    $status
      .fetch({email: email.trim()})
      .then(onStatus)
      .catch(() => undefined)
  }
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap={5}>
        <StepHeader
          title="Welcome"
          description="Enter your email to log in or create an account."
        />
        <Field label="Email" error={error}>
          <Input
            type="email"
            leading={<Mail />}
            value={email}
            onChange={(e) => {
              emailSet(e.target.value)
              errorSet(undefined)
            }}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={$status.loading}
        >
          Continue
        </Button>
      </Stack>
    </form>
  )
}

function LoginStep({
  email: initialEmail,
  savedEmailSet,
}: {
  email: string
  savedEmailSet: (email: string) => void
}) {
  const auth = useAuth()
  const $login = useEndpoint($SecurityLogin)
  const [email, emailSet] = useState(initialEmail)
  const [password, passwordSet] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    $login
      .fetch({
        email: email.trim(),
        password,
        userAgent: navigator.userAgent,
        seasonId: auth.season?.id,
      })
      .then((data) => {
        savedEmailSet(email.trim())
        auth.login(data)
        toast.success(`Welcome back, ${data.user.firstName}`)
        go.to('/')
      })
      .catch(() => undefined)
  }
  const forgotHref = email
    ? `/auth/forgot-password?email=${encodeURIComponent(email)}`
    : '/auth/forgot-password'
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap={5}>
        <StepHeader
          title="Log in"
          description="Welcome back! Please sign in to your account."
        />
        <Field label="Email">
          <Input
            type="email"
            leading={<Mail />}
            value={email}
            onChange={(e) => emailSet(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>
        <Field
          label="Password"
          labelAside={
            <Link subtle {...linkTo(forgotHref)}>
              Forgot password?
            </Link>
          }
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => passwordSet(e.target.value)}
            autoComplete="current-password"
            autoFocus={!!initialEmail}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={$login.loading}
        >
          Log in
        </Button>
        <Stack gap={2} align="center">
          <Text size="sm" tone="tertiary">
            New to the league? <Link {...linkTo('/auth/sign-up')}>Create an account</Link>
          </Text>
          <Link subtle {...linkTo('/auth/welcome')}>
            Try a different email
          </Link>
        </Stack>
      </Stack>
    </form>
  )
}

function SignUpStep({
  email: initialEmail,
  savedEmailSet,
}: {
  email: string
  savedEmailSet: (email: string) => void
}) {
  const auth = useAuth()
  const $signUp = useEndpoint($SecuritySignUp)
  const [form, formSet] = useState({
    firstName: '',
    lastName: '',
    email: initialEmail,
    gender: undefined as TUserGender | undefined,
    termsAccepted: false,
  })
  const [error, errorSet] = useState<string>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim())
      return errorSet('Enter your first and last name.')
    if (!form.gender) return errorSet('Please select your gender.')
    if (!isEmail(form.email)) return errorSet('Enter a valid email address.')
    if (!form.termsAccepted)
      return errorSet('Please accept the terms and conditions to continue.')
    errorSet(undefined)
    const email = form.email.trim()
    $signUp
      .fetch({
        ...form,
        email,
        gender: form.gender,
        seasonId: auth.season?.id,
        userAgent: navigator.userAgent,
      })
      .then(() => {
        savedEmailSet(email)
        toast({title: 'Please check your email inbox.', duration: 8000})
        go.to(verifyUrl(email, 'password'))
      })
      .catch(() => undefined)
  }
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap={4}>
        <StepHeader
          title="Create your account"
          description="Players need an account to join a team and report scores."
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="fr-grid-2">
          <Field label="First name">
            <Input
              value={form.firstName}
              onChange={(e) => formSet({...form, firstName: e.target.value})}
              autoComplete="given-name"
              autoFocus
            />
          </Field>
          <Field label="Last name">
            <Input
              value={form.lastName}
              onChange={(e) => formSet({...form, lastName: e.target.value})}
              autoComplete="family-name"
            />
          </Field>
        </div>
        <Field label="Gender">
          <Select
            placeholder="Select…"
            value={form.gender ?? null}
            onValueChange={(v) =>
              formSet({...form, gender: (v as TUserGender) ?? undefined})
            }
            options={GENDER_OPTIONS.map((o) => ({value: o.key, label: o.label}))}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            leading={<Mail />}
            value={form.email}
            onChange={(e) => formSet({...form, email: e.target.value})}
            autoComplete="email"
          />
        </Field>
        <Field
          description={
            <>
              See the{' '}
              <Link
                href="https://marlowstreetultimate.ultimatecentral.com/insurance"
                external
              >
                insurance
              </Link>{' '}
              and{' '}
              <Link
                href="https://marlowstreetultimate.ultimatecentral.com/policies"
                external
              >
                policy
              </Link>{' '}
              pages.
            </>
          }
        >
          <Checkbox
            checked={form.termsAccepted}
            onCheckedChange={(v) => formSet({...form, termsAccepted: v})}
            label="I accept the terms and conditions"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={$signUp.loading}
        >
          Sign up
        </Button>
        <Text size="sm" tone="tertiary" style={{textAlign: 'center'}}>
          Already signed up? <Link {...linkTo('/auth/welcome')}>Log in</Link>
        </Text>
      </Stack>
    </form>
  )
}

function ForgotStep({email: initialEmail}: {email: string}) {
  const $send = useEndpoint($SecurityForgot)
  const [email, emailSet] = useState(initialEmail)
  const [error, errorSet] = useState<string>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!isEmail(value)) return errorSet('Enter a valid email address.')
    $send
      .fetch(value)
      .then(() => {
        go.to(verifyUrl(value, 'password', 'reset'))
        toast(
          'If an account exists for this email, check your inbox for the code.',
        )
      })
      .catch(() => undefined)
  }
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap={5}>
        <StepHeader
          icon={<KeyRound />}
          title="Forgot password"
          description="A password recovery code will be sent to your email."
        />
        <Field label="Email" error={error}>
          <Input
            type="email"
            leading={<Mail />}
            value={email}
            onChange={(e) => {
              emailSet(e.target.value)
              errorSet(undefined)
            }}
            autoComplete="email"
            autoFocus
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={$send.loading}
        >
          Send code
        </Button>
        <Text size="sm" tone="tertiary" style={{textAlign: 'center'}}>
          Remembered it? <Link {...linkTo('/auth/login')}>Log in</Link>
        </Text>
      </Stack>
    </form>
  )
}

function VerifyStep({
  email,
  status,
  reset,
  savedEmailSet,
}: {
  email: string
  status?: string
  reset?: boolean
  savedEmailSet: (email: string) => void
}) {
  const auth = useAuth()
  const $send = useEndpoint($SecurityForgot)
  const $verify = useEndpoint($SecurityVerify)
  const [code, codeSet] = useState('')
  const [newPassword, newPasswordSet] = useState('')
  const needsPassword = status === 'password'
  useEffect(() => {
    if (!email) go.to('/auth')
  }, [email])
  const submit = () => {
    $verify
      .fetch({
        email,
        code,
        newPassword,
        userAgent: navigator.userAgent,
        seasonId: auth.season?.id,
      })
      .then((data) => {
        savedEmailSet(email)
        auth.login(data)
        toast.success(reset ? 'Password updated' : 'Email verified')
        go.to('/')
      })
      .catch(() => undefined)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      noValidate
    >
      <Stack gap={5}>
        <StepHeader
          icon={reset ? <KeyRound /> : <MailCheck />}
          title={reset ? 'Reset your password' : 'Verify your email'}
          description={
            <>
              Check your inbox for the code we sent to{' '}
              {/* Non-breaking hyphens stop "qa-" / "player" splits; long addresses still wrap. */}
              <b className="fr-email">{email.replace(/-/g, '\u2011')}</b>.
            </>
          }
        />
        <Field label="Code">
          <PinInput
            length={CODE_LENGTH}
            type="alphanumeric"
            groupSize={4}
            value={code}
            onValueChange={codeSet}
          />
        </Field>
        {needsPassword && (
          <Field
            label={reset ? 'New password' : 'Password'}
            description={
              reset
                ? 'Choose a new password (at least 5 characters).'
                : 'Add a password to your account (at least 5 characters).'
            }
          >
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => newPasswordSet(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        )}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={$verify.loading}
          disabled={code.length < CODE_LENGTH}
        >
          Submit &amp; log in
        </Button>
        <Stack gap={2} align="center">
          <Text size="sm" tone="tertiary">
            Didn’t get it?{' '}
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if ($send.loading) return
                $send
                  .fetch(email)
                  .then(() =>
                    toast(
                      'If an account exists for this email, check your inbox for the code.',
                    ),
                  )
                  .catch(() => undefined)
              }}
            >
              Resend code
            </Link>
          </Text>
          <Link subtle {...linkTo('/auth/welcome')}>
            Try a different email
          </Link>
        </Stack>
      </Stack>
    </form>
  )
}
