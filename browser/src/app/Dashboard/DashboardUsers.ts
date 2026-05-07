import {authPoint} from '@shared/auth/authAccess'
import {TUserListSortKey} from '@shared/endpoints/UserDef'
import {TMember} from '@shared/schemas/ioMember'
import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {compareSeasonNames} from '@shared/utils/seasonName'
import {css} from '@emotion/css'
import {TUserSafe} from '@shared/schemas/ioUser'
import {TUserGender} from '@shared/schemas/ioUserGender'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FeatureDashboardUserMembershipsLoad} from '../../endpoints/Feature'
import {
  $UserChangePassword,
  $UserCreate,
  $UserEmailAdd,
  $UserEmailPrimarySet,
  $UserEmailRemove,
  $UserEmailVerifiedSet,
  $UserList,
  $UserToggleAdmin,
  $UserUpdate,
} from '../../endpoints/User'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {GENDER_OPTIONS} from '../../utils/constants'
import {go} from '../../utils/go'
import {objectify} from '../../utils/objectify'
import {userEmails} from '../../utils/userEmails'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputBoolean} from '../Input/InputBoolean'
import {InputSelect} from '../Input/InputSelect'
import {InputString} from '../Input/InputString'
import {useMedia} from '../Media/useMedia'
import {MenuBar, MenuBarOption, MenuBarShadow, MenuBarSpacer} from '../MenuBar'
import {Modal} from '../Modal'
import {Pager} from '../Pager/Pager'
import {usePager} from '../Pager/usePager'
import {Question} from '../Question'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {UserMerge} from '../UserMerge'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
import {useLocalRouter} from '../useLocalRouter'
import {useSling} from '../useThrottle'

export const DashboardUsers: FC = () => {
  const auth = useAuth()
  const pager = usePager()
  const $userList = useEndpoint($UserList)
  const [search, searchSet] = useState('')
  const [users, usersSet] = useState<TUserSafe[]>()
  const [creating, creatingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const [currentUser, currentUserSet] = useState<TUserSafe>()
  const [sortKey, sortKeySet] = useState<TUserListSortKey>('firstName')
  const [sortDirection, sortDirectionSet] = useState<'asc' | 'desc'>('asc')
  const current =
    currentUser ??
    (currentId ? users?.find((i) => currentId === i.id) : undefined)
  const userList = ({
    search: nextSearch = search,
    pager: nextPager = pager.data,
  }: {
    search?: string
    pager?: typeof pager.data
  } = {}) =>
    $userList
      .fetch({
        ...nextPager,
        search: nextSearch,
        sortBy: sortKey,
        sortDirection,
      })
      .then((i) => {
        usersSet(i.users)
        pager.totalSet(i.count)
      })
  const userListDelay = useSling(500, userList)
  useEffect(() => {
    if (!auth.can(authPoint.userManage)) go.to('/')
    else userList()
  }, [auth.current, pager.data, sortKey, sortDirection])
  useEffect(() => {
    if (users === undefined) return
    if (pager.skip !== 0) {
      pager.dataSet({...pager.data, skip: 0})
      return
    }
    userListDelay()
  }, [search])
  const toggleSort = (key: TUserListSortKey) => {
    sortKeySet(key)
    sortDirectionSet((current) => {
      if (sortKey === key) return current === 'asc' ? 'desc' : 'asc'
      return key === 'createdOn' ? 'desc' : 'asc'
    })
    if (pager.skip !== 0) pager.dataSet({...pager.data, skip: 0})
  }
  const getSortIcon = (key: TUserListSortKey) => {
    if (sortKey !== key) return undefined
    return sortDirection === 'asc' ? 'angle-up' : 'angle-down'
  }
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin,
        children:
          users === undefined
            ? $(Spinner)
            : addkeys([
                $('div', {
                  className: css({
                    display: 'flex',
                    gap: theme.fib[5],
                  }),
                  children: addkeys([
                    $(Fragment, {
                      children: $(InputString, {
                        value: search,
                        valueSet: searchSet,
                        placeholder: 'Search',
                      }),
                    }),
                    $(FormBadge, {
                      noshrink: true,
                      label: 'Create User',
                      background: theme.bgAdminButton,
                      click: () => creatingSet(true),
                    }),
                  ]),
                }),
                $(Table, {
                  head: {
                    firstName: {
                      label: 'First Name',
                      grow: 2,
                      click: () => toggleSort('firstName'),
                      icon: getSortIcon('firstName'),
                    },
                    lastName: {
                      label: 'Last Name',
                      grow: 2,
                      click: () => toggleSort('lastName'),
                      icon: getSortIcon('lastName'),
                    },
                    email: {
                      label: 'Email',
                      grow: 4,
                      click: () => toggleSort('email'),
                      icon: getSortIcon('email'),
                    },
                    gender: {
                      label: 'Gender',
                      grow: 2,
                      click: () => toggleSort('gender'),
                      icon: getSortIcon('gender'),
                    },
                    createdOn: {
                      label: 'Created',
                      grow: 2,
                      click: () => toggleSort('createdOn'),
                      icon: getSortIcon('createdOn'),
                    },
                  },
                  body: users.map((user) => ({
                    key: user.id,
                    click: () => {
                      currentIdSet(user.id)
                      currentUserSet(undefined)
                    },
                    data: {
                      firstName: {value: user.firstName},
                      lastName: {value: user.lastName},
                      email: {
                        value: userEmails.primary(user) ?? '',
                      },
                      gender: {
                        value:
                          user.gender[0].toUpperCase() + user.gender.slice(1),
                      },
                      createdOn: {
                        value: dayjs(user.createdOn).format('DD/MM/YYYY'),
                      },
                    },
                  })),
                }),
                $(Pager, {
                  ...pager,
                  count: users?.length,
                }),
              ]),
      }),
      $(Fragment, {
        children:
          creating &&
          $(_DashboardUsersCreate, {
            userSet: (user) => {
              const nextPager = {...pager.data, skip: 0}
              searchSet('')
              creatingSet(false)
              currentIdSet(user.id)
              currentUserSet(user)
              userList({
                search: '',
                pager: nextPager,
              })
              if (pager.skip !== 0) pager.dataSet(nextPager)
            },
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          current &&
          $(_DashboardUsersView, {
            user: current,
            userSet: (i) => {
              currentIdSet(i.id)
              currentUserSet(i)
              usersSet((x) => x?.map((z) => (z.id === i.id ? i : z)))
              userList()
            },
            close: () => {
              currentIdSet(undefined)
              currentUserSet(undefined)
            },
          }),
      }),
    ]),
  })
}

export const _DashboardUsersCreate: FC<{
  userSet: (user: TUserSafe) => void
  close: () => void
}> = ({userSet, close}) => {
  const $userCreate = useEndpoint($UserCreate)
  const form = useForm({
    firstName: '',
    lastName: '',
    email: '',
    gender: undefined as undefined | TUserGender,
    termsAccepted: false,
  })
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'New User',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'First Name'}),
              $(InputString, {
                value: form.data.firstName,
                valueSet: form.link('firstName'),
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Last Name'}),
              $(InputString, {
                value: form.data.lastName,
                valueSet: form.link('lastName'),
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Gender'}),
              $(InputSelect<TUserGender>, {
                value: form.data.gender,
                valueSet: form.link('gender'),
                options: GENDER_OPTIONS,
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Email'}),
              $(InputString, {
                value: form.data.email,
                valueSet: form.link('email'),
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'T&Cs Accepted'}),
              $(InputBoolean, {
                value: form.data.termsAccepted,
                valueSet: form.link('termsAccepted'),
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $userCreate.loading,
            label: $userCreate.loading ? 'Loading' : 'Submit',
            click: () =>
              $userCreate
                .fetch({...form.data, gender: form.data.gender!})
                .then(userSet)
                .then(close),
          }),
        ]),
      }),
    ]),
  })
}

export const _DashboardUsersView: FC<{
  user: TUserSafe
  userSet: (user: TUserSafe) => void
  close: () => void
}> = ({user, userSet, close}) => {
  const media = useMedia()
  const bpSmall = theme.fib[13]
  const isSmall = media.width < bpSmall
  const [open, openSet] = useState(false)
  const auth = useAuth()
  const $toggleAdmin = useEndpoint($UserToggleAdmin)
  const [merge, mergeSet] = useState(false)
  const [changePass, changePassSet] = useState(false)
  const [adminify, adminifySet] = useState(false)
  const router = useLocalRouter('/details', [
    {
      path: '/details',
      title: 'User Details',
      render: () =>
        $(_DashboardUsersViewDetails, {
          user,
          userSet,
          changePassword: () => changePassSet(true),
          toggleAdmin: () => adminifySet(true),
        }),
    },
    {
      path: '/teams',
      title: 'Teams',
      render: () =>
        $(_DashboardUsersViewTeams, {
          user,
        }),
    },
  ])
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        width: theme.fib[13] + theme.fib[10],
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(Fragment, {
                children:
                  isSmall &&
                  $(TopBarBadge, {
                    icon: 'bars',
                    click: () => openSet((i) => !i),
                  }),
              }),
              $(TopBarBadge, {
                grow: true,
                label: 'User',
              }),
              $(TopBarBadge, {
                label: 'Merge',
                click: () => mergeSet(true),
              }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
          }),
          $('div', {
            className: css({
              display: 'flex',
              position: 'relative',
            }),
            children: addkeys([
              (open || !isSmall) &&
                $(MenuBarShadow, {
                  click: () => openSet(false),
                  deactivated: !isSmall,
                  children: $(MenuBar, {
                    width: theme.fib[11] - theme.fib[8],
                    children: addkeys([
                      $(Fragment, {
                        children: router.routes.map((i) => {
                          return $(MenuBarOption, {
                            key: i.path,
                            label: i.title,
                            click: () => {
                              router.go(i.path)
                              if (open) openSet(false)
                            },
                            active: i.path === router.current.path,
                          })
                        }),
                      }),
                      $(MenuBarSpacer),
                    ]),
                  }),
                }),
              $('div', {
                className: css({
                  overflow: 'hidden',
                  background: theme.bgMinor.string(),
                  flexGrow: 1,
                }),
                children: router.render(),
              }),
            ]),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          adminify &&
          $(Question, {
            close: () => adminifySet(false),
            title: user.admin ? 'Remove From Admins' : 'Set As Admin',
            description: user.admin
              ? 'User will no longer have access to admin privileges.'
              : 'User will gain access to admin privileges.',
            options: [
              {label: 'Cancel', click: () => adminifySet(false)},
              {
                label: $toggleAdmin.loading ? 'Loading' : 'Confirm',
                click: () =>
                  $toggleAdmin.fetch({userId: user.id}).then((i) => {
                    if (i.id === auth.current?.user.id) auth.userSet(i)
                    userSet(i)
                    adminifySet(false)
                  }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          merge &&
          $(UserMerge, {
            user,
            userSet: (i) => {
              userSet(i)
              mergeSet(false)
            },
            close: () => mergeSet(false),
          }),
      }),
      $(Fragment, {
        children:
          changePass &&
          $(_DashboardUsersViewChangePassword, {
            user,
            close: () => changePassSet(false),
          }),
      }),
    ]),
  })
}

const _DashboardUsersViewDetails: FC<{
  user: TUserSafe
  userSet: (user: TUserSafe) => void
  changePassword: () => void
  toggleAdmin: () => void
}> = ({user, userSet, changePassword, toggleAdmin}) => {
  const auth = useAuth()
  const toaster = useToaster()
  const [creating, creatingSet] = useState(false)
  const [removing, removingSet] = useState<string>()
  const [primaryify, primaryifySet] = useState<string>()
  const [verifyCheck, verifyCheckSet] = useState<{
    email: string
    verified: boolean
  }>()
  const [verifying, verifyingSet] = useState<string>()
  const $userUpdate = useEndpoint($UserUpdate)
  const $emailAdd = useEndpoint($UserEmailAdd)
  const $emailRemove = useEndpoint($UserEmailRemove)
  const $emailPrimarySet = useEndpoint($UserEmailPrimarySet)
  const $emailVerifiedSet = useEndpoint($UserEmailVerifiedSet)
  const form = useForm({
    ...user,
  })
  const canRemoveEmail = user.emails.length > 1
  const applyUser = (next: TUserSafe) => {
    form.patch(next)
    if (next.id === auth.current?.user.id) auth.userSet(next)
    userSet(next)
  }
  const isDifferent = !objectify.compareKeys(user, form.data, [
    'firstName',
    'lastName',
    'gender',
  ])
  return $(Form, {
    background: theme.bgMinor,
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'First Name'}),
          $(InputString, {
            value: form.data.firstName,
            valueSet: form.link('firstName'),
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Last Name'}),
          $(InputString, {
            value: form.data.lastName,
            valueSet: form.link('lastName'),
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Gender'}),
          $(InputSelect<TUserGender>, {
            value: form.data.gender,
            valueSet: form.link('gender'),
            options: GENDER_OPTIONS,
          }),
        ]),
      }),
      $(FormColumn, {
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {
                grow: true,
                label: 'Emails',
              }),
              $(FormLabel, {
                icon: 'plus',
                click: () => creatingSet(true),
              }),
            ]),
          }),
          $(Fragment, {
            children: user.emails.map((i) => {
              return $(FormRow, {
                key: i.value,
                children: addkeys([
                  $(FormLabel, {
                    grow: true,
                    label: i.value,
                    style: {
                      overflow: 'hidden',
                    },
                  }),
                  $(Fragment, {
                    children: i.primary
                      ? $(FormLabel, {label: 'Primary'})
                      : $(FormBadge, {
                          icon: 'arrow-up',
                          click: () => primaryifySet(i.value),
                        }),
                  }),
                  $(FormBadge, {
                    disabled: $emailVerifiedSet.loading,
                    label:
                      verifying === i.value && $emailVerifiedSet.loading
                        ? 'Loading'
                        : i.verified
                          ? 'Verified'
                          : 'Unverified',
                    icon: i.verified ? 'check' : 'exclamation',
                    background: i.verified
                      ? theme.bgAdminButton
                      : theme.bgDisabled,
                    click: () =>
                      verifyCheckSet({
                        email: i.value,
                        verified: !i.verified,
                      }),
                  }),
                  $(FormBadge, {
                    disabled: !canRemoveEmail,
                    icon: 'trash-alt',
                    click: () => canRemoveEmail && removingSet(i.value),
                  }),
                ]),
              })
            }),
          }),
        ]),
      }),
      $(FormBadge, {
        label: 'Change Password',
        click: changePassword,
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Created'}),
          $(FormLabel, {
            label: dayjs(user.createdOn).format('DD/MM/YY h:mma'),
            background: theme.bgDisabled,
            grow: true,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Last Updated'}),
          $(FormLabel, {
            label: dayjs(user.updatedOn).format('DD/MM/YY h:mma'),
            background: theme.bgDisabled,
            grow: true,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Id'}),
          $(FormLabel, {
            label: user.id,
            background: theme.bgDisabled,
            grow: true,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Admin'}),
          $(FormLabel, {
            label: user.admin ? 'Yes' : 'No',
            grow: true,
          }),
          $(FormBadge, {
            label: user.admin ? 'Remove From Admins' : 'Set As Admin',
            background: theme.bgAdminButton,
            click: toggleAdmin,
          }),
        ]),
      }),
      isDifferent &&
        $(FormBadge, {
          disabled: $userUpdate.loading,
          label: $userUpdate.loading ? 'Loading' : 'Save Changes',
          click: () =>
            $userUpdate.fetch({...form.data, userId: user.id}).then(applyUser),
        }),
      $(Fragment, {
        children:
          creating &&
          $(Modal, {
            children: addkeys([
              $(TopBar, {
                children: addkeys([
                  $(TopBarBadge, {
                    grow: true,
                    label: 'New Email',
                  }),
                  $(TopBarBadge, {
                    icon: 'times',
                    click: () => creatingSet(false),
                  }),
                ]),
              }),
              $(_DashboardUsersViewEmailNew, {
                loading: $emailAdd.loading,
                submit: (email) =>
                  $emailAdd
                    .fetch({userId: user.id, email})
                    .then((next) => {
                      applyUser(next)
                      creatingSet(false)
                      toaster.notify('Email added to account.')
                    }),
              }),
            ]),
          }),
      }),
      $(Fragment, {
        children:
          removing &&
          $(Question, {
            close: () => removingSet(undefined),
            title: 'Remove Email',
            description: `Are you sure you wish "${removing}" to be removed from this account?`,
            options: [
              {label: 'Cancel', click: () => removingSet(undefined)},
              {
                disabled: !canRemoveEmail || $emailRemove.loading,
                label: $emailRemove.loading ? 'Loading' : 'Delete',
                click: () =>
                  canRemoveEmail &&
                  $emailRemove
                    .fetch({userId: user.id, email: removing})
                    .then((next) => {
                      applyUser(next)
                      removingSet(undefined)
                      toaster.notify('Email removed from account.')
                    }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          primaryify &&
          $(Question, {
            close: () => primaryifySet(undefined),
            title: 'Set As Primary',
            description: `Are you sure you wish to make "${primaryify}" the primary email?`,
            options: [
              {label: 'Cancel', click: () => primaryifySet(undefined)},
              {
                label: $emailPrimarySet.loading ? 'Loading' : 'Set As Primary',
                click: () =>
                  $emailPrimarySet
                    .fetch({userId: user.id, email: primaryify})
                    .then((next) => {
                      applyUser(next)
                      primaryifySet(undefined)
                      toaster.notify('Email set as primary.')
                    }),
              },
            ],
          }),
      }),
      $(Fragment, {
        children:
          verifyCheck &&
          $(Question, {
            close: () => verifyCheckSet(undefined),
            title: verifyCheck.verified ? 'Mark Email As Verified' : 'Mark Email As Unverified',
            description: verifyCheck.verified
              ? `Are you sure you wish to mark "${verifyCheck.email}" as verified?`
              : `Are you sure you wish to mark "${verifyCheck.email}" as unverified?`,
            options: [
              {label: 'Cancel', click: () => verifyCheckSet(undefined)},
              {
                disabled: $emailVerifiedSet.loading,
                label: $emailVerifiedSet.loading
                  ? 'Loading'
                  : verifyCheck.verified
                    ? 'Mark As Verified'
                    : 'Mark As Unverified',
                click: () => {
                  const nextCheck = verifyCheck
                  verifyingSet(nextCheck.email)
                  $emailVerifiedSet
                    .fetch({
                      userId: user.id,
                      email: nextCheck.email,
                      verified: nextCheck.verified,
                    })
                    .then((next) => {
                      applyUser(next)
                      verifyCheckSet(undefined)
                      toaster.notify(
                        nextCheck.verified
                          ? 'Email marked as verified.'
                          : 'Email marked as unverified.',
                      )
                    })
                    .finally(() => verifyingSet(undefined))
                },
              },
            ],
          }),
      }),
    ]),
  })
}

const _DashboardUsersViewEmailNew: FC<{
  loading: boolean
  submit: (email: string) => Promise<void>
}> = ({loading, submit}) => {
  const [value, valueSet] = useState('')
  return $(Form, {
    background: theme.bgMinor,
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Email'}),
          $(InputString, {
            value,
            valueSet,
          }),
        ]),
      }),
      $(FormBadge, {
        disabled: loading,
        label: loading ? 'Loading' : 'Submit',
        click: () => submit(value),
      }),
    ]),
  })
}

const _DashboardUsersViewTeams: FC<{user: TUserSafe}> = ({user}) => {
  const $memberList = useEndpoint($FeatureDashboardUserMembershipsLoad)
  const [state, stateSet] = useState<{
    members: TMember[]
    seasons: TSeason[]
    teams: TTeam[]
  }>()
  useEffect(() => {
    $memberList.fetch({userId: user.id}).then(stateSet)
  }, [user.id])
  return $(Form, {
    background: theme.bgMinor,
    children:
      state === undefined
        ? $(Spinner)
        : !state.members.length
          ? $(FormBadge, {
              label: 'No Teams',
              font: theme.fontMinor,
            })
          : $(Table, {
              head: {
                team: {label: 'Team', grow: 3},
                season: {label: 'Season', grow: 3},
                status: {label: 'Status', grow: 2},
              },
              body: state.members
                .slice()
                .sort((a, b) => {
                  const aSeason =
                    state.seasons.find((i) => i.id === a.seasonId)?.name ?? ''
                  const bSeason =
                    state.seasons.find((i) => i.id === b.seasonId)?.name ?? ''
                  const seasonDiff = compareSeasonNames(aSeason, bSeason)
                  if (seasonDiff) return seasonDiff
                  const aTeam =
                    state.teams.find((i) => i.id === a.teamId)?.name ?? ''
                  const bTeam =
                    state.teams.find((i) => i.id === b.teamId)?.name ?? ''
                  return aTeam.localeCompare(bTeam)
                })
                .map((member) => {
                  const team = state.teams.find((i) => i.id === member.teamId)
                  const season = state.seasons.find(
                    (i) => i.id === member.seasonId,
                  )
                  return {
                    key: member.id,
                    data: {
                      team: {
                        value: team?.name ?? '[unknown]',
                        color: team?.color,
                      },
                      season: {
                        value: season?.name ?? '[unknown]',
                      },
                      status: {
                        value: member.pending
                          ? 'Pending'
                          : member.captain
                            ? 'Captain'
                            : 'Member',
                      },
                    },
                  }
                }),
            }),
  })
}

export const _DashboardUsersViewChangePassword: FC<{
  user: TUserSafe
  close: () => void
}> = ({user, close}) => {
  const $changePassword = useEndpoint($UserChangePassword)
  const toaster = useToaster()
  const form = useForm({
    newPassword: '',
  })
  return $(Modal, {
    width: theme.fib[12] + theme.fib[10],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: `${user.firstName} Password`,
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'New Password'}),
              $(InputString, {
                value: form.data.newPassword,
                valueSet: form.link('newPassword'),
              }),
            ]),
          }),
          $(FormBadge, {
            label: $changePassword.loading ? 'Loading' : 'Change Password',
            click: () =>
              $changePassword
                .fetch({...form.data, userId: user.id})
                .then((user) => {
                  const message = `Successfully updated ${user.firstName}'s password.`
                  toaster.notify(message)
                  close()
                }),
          }),
        ]),
      }),
    ]),
  })
}
