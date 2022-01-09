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
import {Modal} from './Modal'
import {Spinner} from './Spinner'
import {Table} from './Table'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const DashboardUsers: FC = () => {
  const auth = useAuth()
  const $userList = useEndpoint($UserList)
  const seasonId = auth.current?.season?.id
  const [users, usersSet] = useState<TUser[]>()
  const [current, currentSet] = useState<TUser>()
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    if (seasonId) $userList.fetch({}).then(usersSet)
  }, [seasonId])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children:
          users === undefined
            ? $(Spinner)
            : $(Table, {
                head: {
                  firstName: {label: 'First Name', grow: 1},
                  lastName: {label: 'Last Name', grow: 1},
                  gender: {label: 'Gender', grow: 1},
                  createdOn: {label: 'Created', grow: 1},
                  updatedOn: {label: 'Updated', grow: 1},
                },
                body: users.map((user) => ({
                  key: user.id,
                  click: () => currentSet(user),
                  data: {
                    firstName: {value: user.firstName},
                    lastName: {value: user.lastName},
                    gender: {value: user.gender},
                    createdOn: {
                      value: dayjs(user.createdOn).format('DD/MM/YYYY'),
                    },
                    updatedOn: {
                      value: dayjs(user.updatedOn).format('DD/MM/YYYY'),
                    },
                  },
                })),
              }),
      }),
      $(Fragment, {
        children:
          current &&
          $(DashboardUsersView, {
            user: current,
            close: () => currentSet(undefined),
          }),
      }),
    ]),
  })
}
/**
 *
 */
export const DashboardUsersView: FC<{user: TUser; close: () => void}> = ({
  user,
  close,
}) => {
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        title: `${user.firstName} ${user.lastName}`,
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'First Name'}),
              $(FormLabel, {label: user.firstName, grow: true}),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Last Name'}),
              $(FormLabel, {label: user.lastName, grow: true}),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Gender'}),
              $(FormLabel, {label: user.gender, grow: true}),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Email'}),
              $(FormLabel, {label: user.email, grow: true}),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Created'}),
              $(FormLabel, {
                label: dayjs(user.createdOn).format(theme.dateFormat),
                grow: true,
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Last Updated'}),
              $(FormLabel, {
                label: dayjs(user.updatedOn).format(theme.dateFormat),
                grow: true,
              }),
            ]),
          }),
        ]),
      }),
    ]),
  })
}
