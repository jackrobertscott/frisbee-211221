import {TUserEmailSafe, TUserSafe} from '@shared/schemas/ioUser'
import {TUserGender} from '@shared/schemas/ioUserGender'
import {
  Avatar,
  Badge,
  Button,
  DescriptionList,
  Dialog,
  Field,
  IconButton,
  Input,
  Select,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Tooltip,
  toast,
} from '@ui'
import {
  ArrowUpToLine,
  BadgeCheck,
  CircleAlert,
  GitMerge,
  KeyRound,
  Mail,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react'
import {type FormEvent, useEffect, useRef, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {
  $UserChangePassword,
  $UserEmailAdd,
  $UserEmailPrimarySet,
  $UserEmailRemove,
  $UserEmailVerifiedSet,
  $UserToggleAdmin,
  $UserUpdate,
} from '../../core/endpoints/User'
import {genderOptions, isUserGender, primaryEmail} from '../common/users'
import {fmtDateTime, fullName} from '../common/format'
import {ActionConfirm} from '../common/ActionConfirm'
import {UserMembershipsTab} from './UserMembershipsTab'
import {UserMergeDialog} from './UserMergeDialog'
import './users.css'

type TTab = 'details' | 'teams'

const profileOf = (user: TUserSafe) => ({
  firstName: user.firstName,
  lastName: user.lastName,
  gender: user.gender,
})

/** Admin: view and edit a user (details, emails, password, admin, teams, merge). */
export function UserDialog({
  user: userProp,
  onClose,
  onUserChange,
}: {
  user?: TUserSafe
  onClose: () => void
  onUserChange: (user: TUserSafe) => void
}) {
  const auth = useAuth()
  const last = useRef(userProp)
  if (userProp) last.current = userProp
  const user = userProp ?? last.current
  const [tab, tabSet] = useState<TTab>('details')
  const [form, formSet] = useState(() =>
    user ? profileOf(user) : {firstName: '', lastName: '', gender: 'other' as TUserGender},
  )
  const [merge, mergeSet] = useState(false)
  const $userUpdate = useEndpoint($UserUpdate)
  const userId = user?.id
  useEffect(() => {
    tabSet('details')
    mergeSet(false)
  }, [userId])
  useEffect(() => {
    if (user) formSet(profileOf(user))
  }, [user])
  if (!user) return null
  const applyUser = (next: TUserSafe) => {
    if (next.id === auth.current?.user.id) auth.userSet(next)
    onUserChange(next)
  }
  const dirty =
    form.firstName !== user.firstName ||
    form.lastName !== user.lastName ||
    form.gender !== user.gender
  const save = (e?: FormEvent) => {
    e?.preventDefault()
    if (!dirty) return
    $userUpdate
      .fetch({
        userId: user.id,
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        avatarUrl: user.avatarUrl,
      })
      .then((next) => {
        applyUser(next)
        toast.success('User saved')
      })
      .catch(() => undefined)
  }
  return (
    <>
      <Dialog
        open={!!userProp}
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={
          <span className="fr-users-title">
            <Avatar size="sm" name={fullName(user)} src={user.avatarUrl} />
            <span>{fullName(user) || 'Unnamed user'}</span>
            {user.admin && (
              <Badge size="sm" tone="info" icon={<ShieldCheck />}>
                Admin
              </Badge>
            )}
          </span>
        }
        description={primaryEmail(user) ?? 'No email'}
        footer={
          <>
            <Button
              variant="ghost"
              leading={<GitMerge />}
              className="fr-footer-left"
              onClick={() => mergeSet(true)}
            >
              Merge…
            </Button>
            <Button onClick={onClose}>Close</Button>
            {tab === 'details' && (
              <Button
                variant="primary"
                disabled={!dirty}
                loading={$userUpdate.loading}
                onClick={() => save()}
              >
                Save changes
              </Button>
            )}
          </>
        }
      >
        <Tabs
          value={tab}
          onValueChange={(v) => tabSet(v === 'teams' ? 'teams' : 'details')}
        >
          <TabList aria-label="User sections">
            <Tab value="details">User details</Tab>
            <Tab value="teams">Teams</Tab>
          </TabList>
          <TabPanel value="details" className="fr-users-panel">
            <Stack gap={5}>
              <form onSubmit={save} noValidate>
                <Stack gap={4}>
                  <div className="fr-grid-2">
                    <Field label="First name">
                      <Input
                        value={form.firstName}
                        onChange={(e) =>
                          formSet({...form, firstName: e.target.value})
                        }
                      />
                    </Field>
                    <Field label="Last name">
                      <Input
                        value={form.lastName}
                        onChange={(e) =>
                          formSet({...form, lastName: e.target.value})
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Gender">
                    <Select
                      value={form.gender}
                      options={genderOptions}
                      onValueChange={(v) =>
                        isUserGender(v) && formSet({...form, gender: v})
                      }
                    />
                  </Field>
                </Stack>
              </form>
              <UserEmails user={user} onUser={applyUser} />
              <UserAccess user={user} onUser={applyUser} />
              <DescriptionList
                items={[
                  {term: 'Created', detail: <span className="fr-num">{fmtDateTime(user.createdOn)}</span>},
                  {term: 'Last updated', detail: <span className="fr-num">{fmtDateTime(user.updatedOn)}</span>},
                  {
                    term: 'Id',
                    detail: (
                      <Text as="span" size="sm" mono>
                        {user.id}
                      </Text>
                    ),
                  },
                ]}
              />
            </Stack>
          </TabPanel>
          <TabPanel value="teams" className="fr-users-panel">
            <UserMembershipsTab userId={user.id} />
          </TabPanel>
        </Tabs>
      </Dialog>
      <UserMergeDialog
        open={!!userProp && merge}
        onOpenChange={mergeSet}
        user={user}
        onMerged={(next) => {
          applyUser(next)
          mergeSet(false)
          toast.success('Users merged')
        }}
      />
    </>
  )
}

function UserEmails({
  user,
  onUser,
}: {
  user: TUserSafe
  onUser: (user: TUserSafe) => void
}) {
  const $emailAdd = useEndpoint($UserEmailAdd)
  const $emailRemove = useEndpoint($UserEmailRemove)
  const $emailPrimarySet = useEndpoint($UserEmailPrimarySet)
  const $emailVerifiedSet = useEndpoint($UserEmailVerifiedSet)
  const [adding, addingSet] = useState(false)
  const [newEmail, newEmailSet] = useState('')
  const [removing, removingSet] = useState<string>()
  const [primaryify, primaryifySet] = useState<string>()
  const [verifyCheck, verifyCheckSet] = useState<{
    email: string
    verified: boolean
  }>()
  const canRemove = user.emails.length > 1
  useEffect(() => {
    if (adding) newEmailSet('')
  }, [adding])
  const addEmail = (e?: FormEvent) => {
    e?.preventDefault()
    $emailAdd
      .fetch({userId: user.id, email: newEmail})
      .then((next) => {
        onUser(next)
        addingSet(false)
        toast.success('Email added to account.')
      })
      .catch(() => undefined)
  }
  return (
    <section className="fr-users-section" aria-labelledby="fr-users-emails">
      <div className="fr-users-section__head">
        <Text as="h3" size="sm" weight="semibold" id="fr-users-emails">
          Emails
        </Text>
        <Button
          size="sm"
          variant="secondary"
          leading={<Plus />}
          onClick={() => addingSet(true)}
        >
          Add email
        </Button>
      </div>
      {user.emails.length === 0 ? (
        <Text size="sm" tone="tertiary">
          This user has no email addresses.
        </Text>
      ) : (
        <ul className="fr-users-emails">
          {user.emails.map((email) => (
            <EmailRow
              key={email.value}
              email={email}
              canRemove={canRemove}
              onPrimary={() => primaryifySet(email.value)}
              onVerified={() =>
                verifyCheckSet({email: email.value, verified: !email.verified})
              }
              onRemove={() => canRemove && removingSet(email.value)}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={adding}
        onOpenChange={addingSet}
        size="sm"
        icon={<Mail />}
        title="New email"
        description={`Add another email address to ${fullName(user)}’s account.`}
        footer={
          <>
            <Button onClick={() => addingSet(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={$emailAdd.loading}
              onClick={() => addEmail()}
            >
              Add email
            </Button>
          </>
        }
      >
        <form onSubmit={addEmail} noValidate>
          <Field label="Email">
            <Input
              type="email"
              leading={<Mail />}
              value={newEmail}
              onChange={(e) => newEmailSet(e.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </Dialog>
      <ActionConfirm
        open={!!removing}
        onOpenChange={(o) => !o && removingSet(undefined)}
        tone="danger"
        icon={<Trash2 />}
        title="Remove email"
        description={`Are you sure you wish "${removing ?? ''}" to be removed from this account?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        action={() => {
          if (!removing || !canRemove) return Promise.resolve()
          return $emailRemove
            .fetch({userId: user.id, email: removing})
            .then((next) => {
              onUser(next)
              toast.success('Email removed from account.')
            })
        }}
      />
      <ActionConfirm
        open={!!primaryify}
        onOpenChange={(o) => !o && primaryifySet(undefined)}
        icon={<ArrowUpToLine />}
        title="Set as primary"
        description={`Are you sure you wish to make "${primaryify ?? ''}" the primary email?`}
        confirmLabel="Set as primary"
        action={() => {
          if (!primaryify) return Promise.resolve()
          return $emailPrimarySet
            .fetch({userId: user.id, email: primaryify})
            .then((next) => {
              onUser(next)
              toast.success('Email set as primary.')
            })
        }}
      />
      <ActionConfirm
        open={!!verifyCheck}
        onOpenChange={(o) => !o && verifyCheckSet(undefined)}
        icon={verifyCheck?.verified ? <BadgeCheck /> : <CircleAlert />}
        tone={verifyCheck?.verified ? 'success' : 'warning'}
        title={
          verifyCheck?.verified
            ? 'Mark email as verified'
            : 'Mark email as unverified'
        }
        description={
          verifyCheck?.verified
            ? `Are you sure you wish to mark "${verifyCheck.email}" as verified?`
            : `Are you sure you wish to mark "${verifyCheck?.email ?? ''}" as unverified?`
        }
        confirmLabel={
          verifyCheck?.verified ? 'Mark as verified' : 'Mark as unverified'
        }
        action={() => {
          const check = verifyCheck
          if (!check) return Promise.resolve()
          return $emailVerifiedSet
            .fetch({
              userId: user.id,
              email: check.email,
              verified: check.verified,
            })
            .then((next) => {
              onUser(next)
              toast.success(
                check.verified
                  ? 'Email marked as verified.'
                  : 'Email marked as unverified.',
              )
            })
        }}
      />
    </section>
  )
}

function EmailRow({
  email,
  canRemove,
  onPrimary,
  onVerified,
  onRemove,
}: {
  email: TUserEmailSafe
  canRemove: boolean
  onPrimary: () => void
  onVerified: () => void
  onRemove: () => void
}) {
  return (
    <li className="fr-users-email">
      <Text as="span" size="sm" weight="medium" truncate className="fr-users-email__value">
        {email.value}
      </Text>
      <div className="fr-users-email__actions">
        {email.primary ? (
          <Badge size="sm" tone="neutral">
            Primary
          </Badge>
        ) : (
          <Button size="sm" variant="ghost" leading={<ArrowUpToLine />} onClick={onPrimary}>
            Make primary
          </Button>
        )}
        <Tooltip
          content={email.verified ? 'Mark as unverified' : 'Mark as verified'}
        >
          <Button
            size="sm"
            variant="secondary"
            leading={email.verified ? <BadgeCheck /> : <CircleAlert />}
            className="fr-users-verify"
            data-verified={email.verified || undefined}
            onClick={onVerified}
          >
            {email.verified ? 'Verified' : 'Unverified'}
          </Button>
        </Tooltip>
        <Tooltip content="Remove email" disabled={!canRemove}>
          <IconButton
            size="sm"
            aria-label={`Remove ${email.value}`}
            disabled={!canRemove}
            onClick={onRemove}
          >
            <Trash2 />
          </IconButton>
        </Tooltip>
      </div>
    </li>
  )
}

function UserAccess({
  user,
  onUser,
}: {
  user: TUserSafe
  onUser: (user: TUserSafe) => void
}) {
  const $toggleAdmin = useEndpoint($UserToggleAdmin)
  const $changePassword = useEndpoint($UserChangePassword)
  const [adminify, adminifySet] = useState(false)
  const [changePass, changePassSet] = useState(false)
  const [password, passwordSet] = useState('')
  useEffect(() => {
    if (changePass) passwordSet('')
  }, [changePass])
  const submitPassword = (e?: FormEvent) => {
    e?.preventDefault()
    $changePassword
      .fetch({userId: user.id, newPassword: password})
      .then((next) => {
        toast.success(`Successfully updated ${next.firstName}'s password.`)
        changePassSet(false)
      })
      .catch(() => undefined)
  }
  return (
    <section className="fr-users-section" aria-labelledby="fr-users-access">
      <div className="fr-users-section__head">
        <Text as="h3" size="sm" weight="semibold" id="fr-users-access">
          Access
        </Text>
      </div>
      <div className="fr-users-access">
        <div className="fr-users-access__row">
          <div className="fr-users-access__text">
            <Text as="span" size="sm" weight="medium">
              Admin
            </Text>
            <Text as="span" size="sm" tone="secondary">
              {user.admin
                ? 'Yes — has access to admin privileges.'
                : 'No — regular league member.'}
            </Text>
          </div>
          <Button
            size="sm"
            variant="secondary"
            leading={user.admin ? <ShieldOff /> : <ShieldCheck />}
            onClick={() => adminifySet(true)}
          >
            {user.admin ? 'Remove from admins' : 'Set as admin'}
          </Button>
        </div>
        <div className="fr-users-access__row">
          <div className="fr-users-access__text">
            <Text as="span" size="sm" weight="medium">
              Password
            </Text>
            <Text as="span" size="sm" tone="secondary">
              Set a new password for this user.
            </Text>
          </div>
          <Button
            size="sm"
            variant="secondary"
            leading={<KeyRound />}
            onClick={() => changePassSet(true)}
          >
            Change password
          </Button>
        </div>
      </div>
      <ActionConfirm
        open={adminify}
        onOpenChange={adminifySet}
        tone={user.admin ? 'danger' : 'info'}
        icon={user.admin ? <ShieldOff /> : <ShieldCheck />}
        title={user.admin ? 'Remove from admins' : 'Set as admin'}
        description={
          user.admin
            ? 'User will no longer have access to admin privileges.'
            : 'User will gain access to admin privileges.'
        }
        confirmLabel="Confirm"
        confirmVariant={user.admin ? 'danger' : 'primary'}
        action={() =>
          $toggleAdmin.fetch({userId: user.id}).then((next) => {
            onUser(next)
            toast.success(
              next.admin ? 'User is now an admin.' : 'User removed from admins.',
            )
          })
        }
      />
      <Dialog
        open={changePass}
        onOpenChange={changePassSet}
        size="sm"
        icon={<KeyRound />}
        title={`${user.firstName} password`}
        footer={
          <>
            <Button onClick={() => changePassSet(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={$changePassword.loading}
              onClick={() => submitPassword()}
            >
              Change password
            </Button>
          </>
        }
      >
        <form onSubmit={submitPassword} noValidate>
          <Field label="New password">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => passwordSet(e.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </Dialog>
    </section>
  )
}
