import {authPoint} from '@shared/auth/authAccess'
import {TMember} from '@shared/schemas/ioMember'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserGenderMatching} from '@shared/schemas/ioUserGenderMatching'
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Stack,
  Text,
  Tooltip,
  toast,
} from '@ui'
import {Bell, Crown, LogOut, Mail, Trash2, UserPlus} from 'lucide-react'
import {type FormEvent, useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {useLoad} from '../../core/hooks/useLoad'
import {
  $MemberAcceptOrDecline,
  $MemberCreate,
  $MemberListOfTeam,
  $MemberLookupByEmail,
  $MemberRemove,
  $MemberSetCaptain,
} from '../../core/endpoints/Member'
import {
  genderMatchingOptions,
  isUserGenderMatching,
} from '../common/users'
import {fullName} from '../common/format'
import {Loading} from '../common/Loading'
import './team.css'

/** Team roster: add by email, accept/decline requests, set captain, remove, leave. */
export function TeamMembers({team, onLeft}: {team: TTeam; onLeft?: () => void}) {
  const auth = useAuth()
  const $memberList = useEndpoint($MemberListOfTeam)
  const $memberRemove = useEndpoint($MemberRemove)
  const $memberRespond = useEndpoint($MemberAcceptOrDecline)
  const $memberPromote = useEndpoint($MemberSetCaptain)
  const list = useLoad(() => $memberList.fetch(team.id), [team.id])
  const [adding, addingSet] = useState(false)
  const [removeId, removeIdSet] = useState<string>()
  const [promoteId, promoteIdSet] = useState<string>()
  const state = list.data
  const current = state?.current
  const canManage =
    auth.can(authPoint.memberManage) && (!!current?.captain || auth.isAdmin())
  const isMember = !!current && !!state?.members.some((m) => m.id === current.id)
  const userOf = (member: TMember) =>
    state?.users.find((u) => u.id === member.userId)
  const nameOf = (member?: TMember) => {
    const user = member && userOf(member)
    return user ? fullName(user) : '[unknown]'
  }
  const removing = state?.members.find((m) => m.id === removeId)
  const removingSelf = !!removeId && removeId === current?.id
  const promoting = state?.members.find((m) => m.id === promoteId)

  const respond = (member: TMember, accept: boolean) =>
    $memberRespond
      .fetch({memberId: member.id, accept})
      .then(() => {
        list.reload()
        toast.success(
          accept ? 'Membership request accepted.' : 'Membership request declined.',
        )
      })
      .catch(() => undefined)

  return (
    <Stack gap={4} className="fr-team-members">
      <div className="fr-team-members__head">
        <Text size="sm" tone="secondary">
          {state
            ? (() => {
                const count = state.members.filter((m) => !m.pending).length
                return `${count} ${count === 1 ? 'player' : 'players'}`
              })()
            : 'Loading players'}
        </Text>
        <Button
          variant="primary"
          size="sm"
          leading={<UserPlus />}
          disabled={!canManage}
          onClick={() => addingSet(true)}
        >
          Add member
        </Button>
      </div>
      {state === undefined ? (
        list.loading ? (
          <Loading label="Loading members" />
        ) : (
          <EmptyState title="Members could not be loaded" />
        )
      ) : !state.members.length ? (
        <EmptyState
          icon={<UserPlus />}
          title="No members yet"
          description="Players can request to join from the dashboard."
          bordered
        />
      ) : (
        <ul className="fr-members">
          {state.members.map((member) => {
            const user = userOf(member)
            const name = nameOf(member)
            return (
              <li key={member.id}>
                <Avatar size="sm" name={name} src={user?.avatarUrl} />
                <div className="fr-members__who">
                  <Text size="sm" weight="medium">
                    {name}
                    {member.id === current?.id && (
                      <Text as="span" size="sm" tone="tertiary">
                        {' '}
                        (you)
                      </Text>
                    )}
                  </Text>
                </div>
                {member.captain && (
                  <Badge size="sm" icon={<Crown />}>
                    Captain
                  </Badge>
                )}
                {member.pending && (
                  <Badge size="sm" tone="warning" icon={<Bell />}>
                    Pending
                  </Badge>
                )}
                {canManage && (
                  <div className="fr-team-members__actions">
                    {member.pending && (
                      <>
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => respond(member, true)}
                          disabled={$memberRespond.loading}
                        >
                          Accept
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => respond(member, false)}
                          disabled={$memberRespond.loading}
                        >
                          Decline
                        </Button>
                      </>
                    )}
                    {!member.captain && !member.pending && (
                      <Tooltip content="Set as captain">
                        <IconButton
                          size="xs"
                          aria-label={`Set ${name} as captain`}
                          onClick={() => promoteIdSet(member.id)}
                        >
                          <Crown />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip content="Remove from team">
                      <IconButton
                        size="xs"
                        aria-label={`Remove ${name} from team`}
                        onClick={() => removeIdSet(member.id)}
                      >
                        <Trash2 />
                      </IconButton>
                    </Tooltip>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {isMember && current && (
        <div className="fr-danger-row">
          <div>
            <Text size="sm" weight="medium">
              Leave {team.name}
            </Text>
            <Text size="xs" tone="tertiary">
              You won’t be able to report scores until you join another team.
            </Text>
          </div>
          <Button
            variant="danger"
            size="sm"
            leading={<LogOut />}
            onClick={() => removeIdSet(current.id)}
          >
            Leave team
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(o) => !o && removeIdSet(undefined)}
        tone="danger"
        icon={removingSelf ? <LogOut /> : <Trash2 />}
        title={removingSelf ? 'Leave team?' : `Remove ${nameOf(removing)}?`}
        description={`Are you sure you wish to remove ${
          removingSelf ? 'yourself' : 'this person'
        } from the team?`}
        confirmLabel={removingSelf ? 'Leave team' : 'Remove'}
        confirmVariant="danger"
        onConfirm={() => {
          if (!removeId) return
          const self = removingSelf
          return $memberRemove
            .fetch(removeId)
            .then(() => {
              toast.success('Member removed from team.')
              if (self) {
                auth.teamSet(undefined)
                onLeft?.()
              } else list.reload()
            })
        }}
      />
      <ConfirmDialog
        open={!!promoteId}
        onOpenChange={(o) => !o && promoteIdSet(undefined)}
        icon={<Crown />}
        title={`Set ${nameOf(promoting)} as captain?`}
        description="Are you sure you wish to set this person as the team captain?"
        onConfirm={() => {
          if (!promoteId) return
          return $memberPromote
            .fetch(promoteId)
            .then(() => {
              list.reload()
              toast.success('Captain of team changed.')
            })
        }}
      />
      <AddMemberDialog
        team={team}
        open={adding}
        onOpenChange={addingSet}
        onAdded={() => {
          list.reload()
          addingSet(false)
        }}
      />
    </Stack>
  )
}

const initialMember = () => ({
  email: '',
  firstName: '',
  lastName: '',
  genderMatching: undefined as TUserGenderMatching | undefined,
})

/** Look up a player by email; unknown emails continue to a details step that creates the user. */
function AddMemberDialog({
  team,
  open,
  onOpenChange,
  onAdded,
}: {
  team: TTeam
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const $memberCreate = useEndpoint($MemberCreate)
  const $memberLookup = useEndpoint($MemberLookupByEmail)
  const [form, formSet] = useState(initialMember)
  const [step, stepSet] = useState<'email' | 'details'>('email')
  useEffect(() => {
    if (!open) return
    formSet(initialMember())
    stepSet('email')
  }, [open])
  const busy = $memberLookup.loading || $memberCreate.loading
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    if (step === 'email') {
      $memberLookup
        .fetch({teamId: team.id, email: form.email})
        .then((result) => {
          if (!result.exists) {
            stepSet('details')
            return
          }
          return $memberCreate
            .fetch({teamId: team.id, email: form.email})
            .then(() => {
              toast.success(
                result.user
                  ? `${fullName(result.user)} added to team.`
                  : 'Member added to team.',
              )
              onAdded()
            })
        })
        .catch(() => undefined)
      return
    }
    $memberCreate
      .fetch({
        teamId: team.id,
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        genderMatching: form.genderMatching,
      })
      .then(() => {
        toast.success('Member created and added to team.')
        onAdded()
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<UserPlus />}
      title="Add member"
      description={
        step === 'email'
          ? `Add a player to ${team.name} by their email address.`
          : 'No account uses this email yet. Enter their details to create one.'
      }
      footer={
        <>
          {step === 'details' && (
            <Button
              variant="ghost"
              className="fr-footer-left"
              onClick={() => stepSet('email')}
            >
              Back
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            {step === 'email' ? 'Continue' : 'Create & add'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack gap={4}>
          <Field label="Email">
            <Input
              type="email"
              leading={<Mail />}
              value={form.email}
              onChange={(e) => formSet({...form, email: e.target.value})}
              readOnly={step === 'details'}
              autoFocus={step === 'email'}
            />
          </Field>
          {step === 'details' && (
            <>
              <div className="fr-grid-2">
                <Field label="First name">
                  <Input
                    value={form.firstName}
                    onChange={(e) => formSet({...form, firstName: e.target.value})}
                    autoFocus
                  />
                </Field>
                <Field label="Last name">
                  <Input
                    value={form.lastName}
                    onChange={(e) => formSet({...form, lastName: e.target.value})}
                  />
                </Field>
              </div>
              <Field label="Gender matching">
                <Select
                  value={form.genderMatching ?? null}
                  onValueChange={(v) =>
                    formSet({
                      ...form,
                      genderMatching: isUserGenderMatching(v) ? v : undefined,
                    })
                  }
                  placeholder="Select gender matching"
                  options={genderMatchingOptions}
                />
              </Field>
            </>
          )}
          <button type="submit" hidden />
        </Stack>
      </form>
    </Dialog>
  )
}
