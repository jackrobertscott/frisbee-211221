import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$UserList} from '../endpoints/User'
import {TUser} from '../schemas/ioUser'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {go} from '../utils/go'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {Spinner} from './Spinner'
import {Table} from './Table'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useSling} from './useThrottle'
/**
 *
 */
export const UserMerge: FC<{
  user: TUser
  close: () => void
}> = ({user, close}) => {
  const auth = useAuth()
  const $userList = useEndpoint($UserList)
  const [users, usersSet] = useState<TUser[]>()
  const [search, searchSet] = useState(user.firstName)
  const [currentId, currentIdSet] = useState<string>()
  const current = currentId && users?.find((i) => currentId === i.id)
  const userList = () =>
    $userList.fetch({search, limit: 10}).then((i) => {
      usersSet(i.users.filter((x) => x.id !== user.id))
    })
  const userListDelay = useSling(500, userList)
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    else userList()
  }, [auth.current])
  useEffect(() => {
    if (users !== undefined) userListDelay()
  }, [search])
  return $(Modal, {
    width: theme.fib[14],
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
        children: $(Fragment, {
          children:
            users === undefined
              ? $(Spinner)
              : addkeys([
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
                      click: () => currentIdSet(user.id),
                      data: {
                        email: {
                          value:
                            user.emails?.[0]?.value ??
                            user.email ??
                            '[unknown]',
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
        }),
      }),
    ]),
  })
}
