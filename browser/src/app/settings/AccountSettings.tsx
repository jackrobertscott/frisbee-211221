import {TUserSafe} from '@shared/schemas/ioUser'
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  Input,
  PinInput,
  Select,
  Stack,
  Text,
  Tooltip,
  toast,
} from '@ui'
import {ArrowUpCircle, Mail, MailCheck, MailPlus, Star, Trash2} from 'lucide-react'
import {type FormEvent, useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {
  $UserCurrentEmailAdd,
  $UserCurrentEmailCodeResend,
  $UserCurrentEmailPrimarySet,
  $UserCurrentEmailRemove,
  $UserCurrentEmailVerify,
  $UserCurrentUpdate,
} from '../../endpoints/User'
import {GENDER_OPTIONS} from '../../utils/constants'
import {fullName} from '../shared'
import './settings.css'

const CODE_LENGTH = 8

const profileOf = (user?: TUserSafe) => ({
  firstName: user?.firstName ?? '',
  lastName: user?.lastName ?? '',
  gender: user?.gender,
})

/** Profile (name, gender, avatar) and email addresses of the signed-in user. */
export function AccountSettings({role}: {role: string}) {
  const auth = useAuth()
  const user = auth.current?.user
  const $userUpdate = useEndpoint($UserCurrentUpdate)
  const $emailRemove = useEndpoint($UserCurrentEmailRemove)
  const $primarySet = useEndpoint($UserCurrentEmailPrimarySet)
  const [form, formSet] = useState(() => profileOf(user))
  const [creating, creatingSet] = useState(false)
  const [verifying, verifyingSet] = useState<string>()
  const [removing, removingSet] = useState<string>()
  const [primaryify, primaryifySet] = useState<string>()
  const userId = user?.id
  useEffect(() => formSet(profileOf(user)), [userId])
  if (!user) return null
  const emails = user.emails
  const canRemoveEmail = emails.length > 1
  const userSet = (next: TUserSafe) => auth.userSet(next)

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    $userUpdate
      .fetch({
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        avatarUrl: user.avatarUrl,
      })
      .then((next) => {
        userSet(next)
        toast.success('Account updated.')
      })
      .catch(() => undefined)
  }

  return (
    <Stack gap={6}>
      <form onSubmit={save} noValidate>
        <Stack gap={4}>
          <div className="fr-settings-profile">
            <Avatar
              size="lg"
              name={fullName({firstName: form.firstName, lastName: form.lastName})}
              src={user.avatarUrl}
            />
            <div>
              <Text weight="medium">{fullName(user)}</Text>
              <Text size="xs" tone="tertiary">
                {role}
              </Text>
            </div>
          </div>
          <div className="fr-grid-2">
            <Field label="First name">
              <Input
                value={form.firstName}
                onChange={(e) => formSet({...form, firstName: e.target.value})}
              />
            </Field>
            <Field label="Last name">
              <Input
                value={form.lastName}
                onChange={(e) => formSet({...form, lastName: e.target.value})}
              />
            </Field>
          </div>
          <Field label="Gender">
            <Select
              value={form.gender ?? null}
              onValueChange={(v) =>
                formSet({
                  ...form,
                  gender: GENDER_OPTIONS.find((o) => o.key === v)?.key ?? form.gender,
                })
              }
              placeholder="Select gender"
              options={GENDER_OPTIONS.map((o) => ({value: o.key, label: o.label}))}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            loading={$userUpdate.loading}
            className="fr-settings-save"
          >
            Save
          </Button>
        </Stack>
      </form>

      <Stack gap={3}>
        <div className="fr-settings-section">
          <div>
            <Text size="sm" weight="medium">
              Emails
            </Text>
            <Text size="xs" tone="tertiary">
              Your primary email is used to sign in and receive notifications.
            </Text>
          </div>
          <Button size="sm" leading={<MailPlus />} onClick={() => creatingSet(true)}>
            Add email
          </Button>
        </div>
        <ul className="fr-members">
          {emails.map((email) => (
            <li key={email.value}>
              <Mail className="fr-settings-email__icon" aria-hidden />
              <div className="fr-members__who">
                <Text size="sm" className="fr-settings-email__value">
                  {email.value}
                </Text>
              </div>
              {email.primary && (
                <Badge size="sm" tone="accent" icon={<Star />}>
                  Primary
                </Badge>
              )}
              {!email.verified && (
                <Badge size="sm" tone="warning" dot>
                  Unverified
                </Badge>
              )}
              <div className="fr-members__actions">
                {!email.verified ? (
                  <Button size="xs" onClick={() => verifyingSet(email.value)}>
                    Verify
                  </Button>
                ) : (
                  !email.primary && (
                    <Tooltip content="Set as primary">
                      <IconButton
                        size="xs"
                        aria-label={`Set ${email.value} as primary`}
                        onClick={() => primaryifySet(email.value)}
                      >
                        <ArrowUpCircle />
                      </IconButton>
                    </Tooltip>
                  )
                )}
                <Tooltip
                  content={
                    canRemoveEmail ? 'Remove email' : 'Your only email can’t be removed'
                  }
                >
                  <IconButton
                    size="xs"
                    aria-label={`Remove ${email.value}`}
                    disabled={!canRemoveEmail}
                    onClick={() => canRemoveEmail && removingSet(email.value)}
                  >
                    <Trash2 />
                  </IconButton>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      </Stack>

      <EmailAddDialog
        open={creating}
        onOpenChange={creatingSet}
        onAdded={(next, email) => {
          userSet(next)
          creatingSet(false)
          verifyingSet(email)
        }}
      />
      <EmailVerifyDialog
        email={verifying}
        onClose={() => verifyingSet(undefined)}
        onVerified={(next) => {
          userSet(next)
          verifyingSet(undefined)
          toast.success('Email verified.')
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && removingSet(undefined)}
        tone="danger"
        icon={<Trash2 />}
        title="Remove email"
        description={`Are you sure you wish "${removing ?? ''}" to be removed from this account?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (!removing || !canRemoveEmail) return
          return $emailRemove
            .fetch({email: removing})
            .then((next) => {
              userSet(next)
              toast.success('Email removed from account.')
            })
        }}
      />
      <ConfirmDialog
        open={!!primaryify}
        onOpenChange={(o) => !o && primaryifySet(undefined)}
        icon={<Star />}
        title="Set as primary"
        description={`Are you sure you wish to make "${primaryify ?? ''}" your primary email?`}
        confirmLabel="Set as primary"
        onConfirm={() => {
          if (!primaryify) return
          return $primarySet
            .fetch({email: primaryify})
            .then((next) => {
              userSet(next)
              toast.success('Email set as primary.')
            })
        }}
      />
    </Stack>
  )
}

function EmailAddDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (user: TUserSafe, email: string) => void
}) {
  const $emailAdd = useEndpoint($UserCurrentEmailAdd)
  const [value, valueSet] = useState('')
  useEffect(() => {
    if (open) valueSet('')
  }, [open])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if ($emailAdd.loading) return
    const email = value.trim()
    $emailAdd
      .fetch({email})
      .then((user) => onAdded(user, email))
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<MailPlus />}
      title="New email"
      description="We’ll send a code to this address to verify it."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={$emailAdd.loading} onClick={() => submit()}>
            Add email
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Field label="Email">
          <Input
            type="email"
            leading={<Mail />}
            value={value}
            onChange={(e) => valueSet(e.target.value)}
            autoFocus
          />
        </Field>
      </form>
    </Dialog>
  )
}

function EmailVerifyDialog({
  email,
  onClose,
  onVerified,
}: {
  email?: string
  onClose: () => void
  onVerified: (user: TUserSafe) => void
}) {
  const $emailVerify = useEndpoint($UserCurrentEmailVerify)
  const $resend = useEndpoint($UserCurrentEmailCodeResend)
  const [code, codeSet] = useState('')
  useEffect(() => codeSet(''), [email])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!email || $emailVerify.loading) return
    $emailVerify
      .fetch({email, code})
      .then(onVerified)
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={!!email}
      onOpenChange={(o) => !o && onClose()}
      icon={<MailCheck />}
      title="Verify email"
      description={
        <>
          Enter the code we sent to <b>{email}</b>.
        </>
      }
      footer={
        <>
          <Button
            variant="ghost"
            className="fr-footer-left"
            loading={$resend.loading}
            onClick={() =>
              email &&
              $resend
                .fetch({email})
                .then(() => toast.success('Code sent to your inbox.'))
                .catch(() => undefined)
            }
          >
            Resend code
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={$emailVerify.loading}
            disabled={code.length < CODE_LENGTH}
            onClick={() => submit()}
          >
            Verify
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Field label="Code">
          <PinInput
            length={CODE_LENGTH}
            type="alphanumeric"
            groupSize={4}
            value={code}
            onValueChange={codeSet}
          />
        </Field>
      </form>
    </Dialog>
  )
}
