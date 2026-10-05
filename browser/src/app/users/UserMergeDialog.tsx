import {TUserSafe} from '@shared/schemas/ioUser'
import {
  Alert,
  Avatar,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  List,
  ListItem,
  SearchInput,
  Stack,
  Text,
  Tooltip,
} from '@ui'
import {ArrowUp, GitMerge, SearchX, X} from 'lucide-react'
import {type ReactNode, useEffect, useState} from 'react'
import {useEndpoint} from '../../core/useEndpoint'
import {useLoad} from '../../core/useLoad'
import {$UserList, $UserMerge} from '../../endpoints/User'
import {userEmails} from '../../utils/userEmails'
import {fmtShort, fullName, Loading, useDebounced} from '../shared'
import {ActionConfirm} from './common'
import './users.css'

const emailLabel = (user: TUserSafe) => userEmails.primary(user) ?? '[no email]'

/** Merge a duplicate account (user 2) into `user` (user 1). */
export function UserMergeDialog({
  open,
  onOpenChange,
  user,
  onMerged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: TUserSafe
  onMerged: (user: TUserSafe) => void
}) {
  const $merge = useEndpoint($UserMerge)
  const [other, otherSet] = useState<TUserSafe>()
  const [confirm, confirmSet] = useState(false)
  useEffect(() => {
    if (open) otherSet(undefined)
  }, [open])
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        icon={<GitMerge />}
        title="Merge users"
        description={`Pick a duplicate account to merge into ${fullName(user)}.`}
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="danger"
              leading={<GitMerge />}
              disabled={!other}
              onClick={() => confirmSet(true)}
            >
              Merge users
            </Button>
          </>
        }
      >
        {other ? (
          <Stack gap={3}>
            <MergeUserCard user={user} label="Keep" />
            <div className="fr-users-merge__arrow" aria-hidden>
              <ArrowUp />
            </div>
            <MergeUserCard
              user={other}
              label="Merge in"
              action={
                <Tooltip content="Choose a different user">
                  <IconButton
                    aria-label="Choose a different user"
                    onClick={() => otherSet(undefined)}
                  >
                    <X />
                  </IconButton>
                </Tooltip>
              }
            />
            <Alert tone="warning" title="This can’t be undone">
              {`${emailLabel(other)} will be merged into ${emailLabel(user)}.`}
            </Alert>
          </Stack>
        ) : (
          open && <MergeSearch user={user} onPick={otherSet} />
        )}
      </Dialog>
      {other && (
        <ActionConfirm
          open={confirm}
          onOpenChange={confirmSet}
          tone="danger"
          icon={<GitMerge />}
          title="Merge"
          description={`Are you sure you wish to merge <${emailLabel(other)}> into <${emailLabel(user)}>?`}
          confirmLabel="Merge"
          confirmVariant="danger"
          action={() =>
            $merge
              .fetch({user1Id: user.id, user2Id: other.id})
              .then(onMerged)
          }
        />
      )}
    </>
  )
}

function MergeUserCard({
  user,
  label,
  action,
}: {
  user: TUserSafe
  label: string
  action?: ReactNode
}) {
  return (
    <div className="fr-users-merge__card">
      <Avatar size="sm" name={fullName(user)} src={user.avatarUrl} />
      <div className="fr-users-merge__who">
        <Text as="span" size="sm" weight="medium" truncate>
          {fullName(user)}
        </Text>
        <Text as="span" size="sm" tone="secondary" truncate>
          {emailLabel(user)}
        </Text>
      </div>
      <Text as="span" size="sm" tone="tertiary">
        {label}
      </Text>
      {action}
    </div>
  )
}

function MergeSearch({
  user,
  onPick,
}: {
  user: TUserSafe
  onPick: (user: TUserSafe) => void
}) {
  const $userList = useEndpoint($UserList)
  const [query, querySet] = useState(user.firstName)
  const search = useDebounced(query, 500)
  const users = useLoad(
    () =>
      $userList
        .fetch({search, limit: 10})
        .then((r) => r.users.filter((u) => u.id !== user.id)),
    [search, user.id],
  )
  return (
    <Stack gap={3}>
      <Field label="Search">
        <SearchInput
          value={query}
          onChange={(e) => querySet(e.target.value)}
          onClear={() => querySet('')}
          placeholder="Search by name or email"
          autoFocus
        />
      </Field>
      {users.data === undefined ? (
        <Loading />
      ) : users.data.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title="No matching users"
          description="Try another name or email address."
        />
      ) : (
        <List className="fr-users-merge__list">
          {users.data.map((u) => (
            <ListItem
              key={u.id}
              leading={<Avatar size="sm" name={fullName(u)} src={u.avatarUrl} />}
              title={fullName(u)}
              description={emailLabel(u)}
              trailing={
                <span className="fr-num">Created {fmtShort(u.createdOn)}</span>
              }
              onClick={() => onPick(u)}
            />
          ))}
        </List>
      )}
    </Stack>
  )
}
