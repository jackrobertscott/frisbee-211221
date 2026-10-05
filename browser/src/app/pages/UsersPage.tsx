import {authPoint} from '@shared/auth/authAccess'
import {
  TUserListSortKey,
  USER_LIST_SORT_KEYS,
} from '@shared/endpoints/UserDef'
import {TUserSafe} from '@shared/schemas/ioUser'
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Text,
  type SortState,
} from '@ui'
import {Plus, ShieldCheck, UserRound} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/useEndpoint'
import {useLoad} from '../../core/useLoad'
import {$UserList} from '../../endpoints/User'
import {go} from '../../utils/go'
import {userEmails} from '../../utils/userEmails'
import {fmtShort, fullName, Toolbar, useServerPaging} from '../shared'
import {useShell} from '../shell'
import {genderLabel} from '../users/common'
import {UserCreateDialog} from '../users/UserCreateDialog'
import {UserDialog} from '../users/UserDialog'
import '../users/users.css'

interface TSort {
  key: TUserListSortKey
  direction: 'asc' | 'desc'
}

const isSortKey = (key: string): key is TUserListSortKey =>
  USER_LIST_SORT_KEYS.some((k) => k === key)

export function UsersPage() {
  const auth = useAuth()
  const shell = useShell()
  const canManage = auth.can(authPoint.userManage)
  const paging = useServerPaging()
  const $userList = useEndpoint($UserList)
  const [sort, sortSet] = useState<TSort>({key: 'firstName', direction: 'asc'})
  const [creating, creatingSet] = useState(false)
  const [current, currentSet] = useState<TUserSafe>()
  useEffect(() => {
    if (!canManage) go.to('/')
  }, [canManage])
  const users = useLoad(
    () =>
      canManage
        ? $userList.fetch({
            search: paging.search,
            sortBy: sort.key,
            sortDirection: sort.direction,
            skip: paging.skip,
            limit: paging.limit,
          })
        : Promise.resolve({count: 0, users: []}),
    [
      auth.current,
      canManage,
      paging.search,
      paging.skip,
      paging.limit,
      sort.key,
      sort.direction,
      shell.version,
    ],
  )
  const changeSort = (next: SortState | null) => {
    const key = next?.key ?? sort.key
    if (!isSortKey(key)) return
    sortSet({
      key,
      direction:
        key === sort.key
          ? sort.direction === 'asc'
            ? 'desc'
            : 'asc'
          : key === 'createdOn'
            ? 'desc'
            : 'asc',
    })
    paging.setPage(1)
  }
  const userChanged = (next: TUserSafe) => {
    currentSet(next)
    users.set((data) =>
      data
        ? {...data, users: data.users.map((u) => (u.id === next.id ? next : u))}
        : data,
    )
    users.reload()
  }
  const rows = users.data?.users ?? []
  return (
    <div className="fr-page">
      <Toolbar
        search={paging.query}
        onSearch={paging.setQuery}
        placeholder="Search by name or email"
      >
        <Button
          variant="primary"
          leading={<Plus />}
          onClick={() => creatingSet(true)}
        >
          Create user
        </Button>
      </Toolbar>
      <DataTable<TUserSafe>
        aria-label="Users"
        rowKey={(u) => u.id}
        rows={rows}
        loading={users.loading && !users.data}
        sort={sort}
        onSortChange={changeSort}
        sortRows={false}
        onRowClick={currentSet}
        empty={
          <EmptyState
            icon={<UserRound />}
            title={users.failed ? 'Couldn’t load users' : 'No matching users'}
            description={
              users.failed
                ? 'Refresh the page to try again.'
                : 'Try another name or email address.'
            }
          />
        }
        columns={[
          {
            key: 'firstName',
            header: 'First name',
            sortable: true,
            render: (u) => (
              <span className="fr-users-name">
                <Avatar size="sm" name={fullName(u)} src={u.avatarUrl} />
                <button
                  type="button"
                  className="fr-users-name__btn"
                  onClick={() => currentSet(u)}
                >
                  {u.firstName || '—'}
                </button>
                {u.admin && (
                  <Badge size="sm" tone="info" icon={<ShieldCheck />}>
                    Admin
                  </Badge>
                )}
              </span>
            ),
          },
          {key: 'lastName', header: 'Last name', sortable: true},
          {
            key: 'email',
            header: 'Email',
            sortable: true,
            hideBelow: 'sm',
            render: (u) => <UserEmailCell user={u} />,
          },
          {
            key: 'gender',
            header: 'Gender',
            sortable: true,
            hideBelow: 'md',
            render: (u) => genderLabel(u.gender),
          },
          {
            key: 'createdOn',
            header: 'Created',
            sortable: true,
            hideBelow: 'lg',
            render: (u) => <span className="fr-num">{fmtShort(u.createdOn)}</span>,
          },
        ]}
      />
      {paging.pager(users.data?.count ?? 0)}
      <UserCreateDialog
        open={creating}
        onOpenChange={creatingSet}
        onCreated={(user) => {
          paging.setQuery('')
          paging.setPage(1)
          currentSet(user)
          users.reload()
        }}
      />
      <UserDialog
        user={current}
        onClose={() => currentSet(undefined)}
        onUserChange={userChanged}
      />
    </div>
  )
}

function UserEmailCell({user}: {user: TUserSafe}) {
  const primary =
    user.emails.find((e) => e.primary) ?? user.emails[0]
  if (!primary)
    return (
      <Text as="span" size="sm" tone="tertiary">
        —
      </Text>
    )
  return (
    <span className="fr-users-email-cell">
      <Text as="span" size="sm" tone="secondary" truncate>
        {userEmails.primary(user)}
      </Text>
      {!primary.verified && (
        <Badge size="sm" tone="warning" variant="outline">
          Unverified
        </Badge>
      )}
    </span>
  )
}
