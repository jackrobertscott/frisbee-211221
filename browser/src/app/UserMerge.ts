import {authPoint} from '@shared/auth/authAccess'
import {css} from '@emotion/css'
import {TUserSafe} from '@shared/schemas/ioUser'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$UserList, $UserMerge} from '../endpoints/User'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {go} from '../utils/go'
import {userEmails} from '../utils/userEmails'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {Icon} from './Icon'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {Question} from './Question'
import {Spinner} from './Spinner'
import {Table} from './Table'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useSling} from './useThrottle'

const userEmailLabel = (user: TUserSafe) => userEmails.primary(user) ?? '[no email]'

export const UserMerge: FC<{
  user: TUserSafe
  userSet: (user: TUserSafe) => void
  close: () => void
}> = ({user: user1, userSet: user1Set, close}) => {
  const $merge = useEndpoint($UserMerge)
  const [check, checkSet] = useState(false)
  const [user2, user2Set] = useState<TUserSafe>()
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        width: user2 === undefined ? theme.fib[14] : theme.fib[13],
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(TopBarBadge, {
                grow: true,
                label: 'User Merge',
              }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
          }),
          $(Form, {
            background: theme.bgMinor,
            children:
              user2 === undefined
                ? $(_UserMergeSelect, {
                    user1,
                    user2Set,
                  })
                : $(Fragment, {
                    children: addkeys([
                      $(FormRow, {
                        children: addkeys([
                          $(FormLabel, {
                            grow: true,
                            style: {overflow: 'hidden'},
                            label: `${user1.firstName} ${
                              user1.lastName
                            } <${userEmailLabel(user1)}>`,
                          }),
                        ]),
                      }),
                      $('div', {
                        className: css({
                          justifyContent: 'center',
                          display: 'flex',
                        }),
                        children: $(Icon, {
                          icon: 'arrow-up',
                          multiple: 0.9,
                        }),
                      }),
                      $(FormRow, {
                        children: addkeys([
                          $(FormLabel, {
                            grow: true,
                            style: {overflow: 'hidden'},
                            label: `${user2.firstName} ${
                              user2.lastName
                            } <${userEmailLabel(user2)}>`,
                          }),
                          $(FormBadge, {
                            icon: 'times',
                            click: () => user2Set(undefined),
                          }),
                        ]),
                      }),
                      $(FormBadge, {
                        label: 'Submit',
                        click: () => checkSet(true),
                      }),
                    ]),
                  }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          check &&
          user2 &&
          $(Question, {
            close: () => checkSet(false),
            title: 'Merge',
            description: `Are you sure you wish to merge <${userEmailLabel(user2)}> into <${userEmailLabel(user1)}>?`,
            options: [
              {label: 'Cancel', click: () => checkSet(false)},
              {
                label: $merge.loading ? 'Loading' : 'Merge',
                click: () =>
                  user2 &&
                  $merge
                    .fetch({user1Id: user1.id, user2Id: user2.id})
                    .then(user1Set),
              },
            ],
          }),
      }),
    ]),
  })
}

const _UserMergeSelect: FC<{
  user1: TUserSafe
  user2Set: (user: TUserSafe) => void
}> = ({user1, user2Set}) => {
  const auth = useAuth()
  const $userList = useEndpoint($UserList)
  const [users, usersSet] = useState<TUserSafe[]>()
  const [search, searchSet] = useState(user1.firstName)
  const userList = () =>
    $userList.fetch({search, limit: 10}).then((i) => {
      usersSet(i.users.filter((x) => x.id !== user1.id))
    })
  const userListDelay = useSling(500, userList)
  useEffect(() => {
    if (users !== undefined) userListDelay()
  }, [search])
  useEffect(() => {
    if (!auth.can(authPoint.userAdmin)) go.to('/')
    else userList()
  }, [auth.current])
  if (users === undefined) {
    return $(Spinner)
  }
  return $(Fragment, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Search'}),
          $(InputString, {
            value: search,
            valueSet: searchSet,
            placeholder: '...',
          }),
        ]),
      }),
      $(Table, {
        head: {
          email: {label: 'Email', grow: 3},
          firstName: {label: 'First Name', grow: 3},
          lastName: {label: 'Last Name', grow: 3},
          createdOn: {label: 'Created', grow: 3},
        },
        body: users.map((user) => ({
          key: user.id,
          click: () => user2Set(user),
          data: {
            email: {
              value: userEmails.primary(user) ?? '[unknown]',
            },
            firstName: {value: user.firstName},
            lastName: {value: user.lastName},
            createdOn: {
              value: dayjs(user.createdOn).format('DD/MM/YYYY'),
            },
          },
        })),
      }),
    ]),
  })
}
