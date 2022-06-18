import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $UserChangePassword,
  $UserCreate,
  $UserList,
  $UserToggleAdmin,
  $UserUpdate,
} from '../../endpoints/User'
import {TUser} from '../../schemas/ioUser'
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
import {Modal} from '../Modal'
import {Pager} from '../Pager/Pager'
import {usePager} from '../Pager/usePager'
import {Question} from '../Question'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
import {UserMerge} from '../UserMerge'
import {useSling} from '../useThrottle'
/**
 *
 */
export const DashboardUsers: FC = () => {
  const auth = useAuth()
  const pager = usePager()
  const $userList = useEndpoint($UserList)
  const [search, searchSet] = useState('')
  const [users, usersSet] = useState<TUser[]>()
  const [creating, creatingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const current = currentId && users?.find((i) => currentId === i.id)
  const userList = () =>
    $userList.fetch({...pager.data, search}).then((i) => {
      usersSet(i.users)
      pager.totalSet(i.count)
    })
  const userListDelay = useSling(500, userList)
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    else userList()
  }, [auth.current, pager.data])
  useEffect(() => {
    if (users !== undefined) userListDelay()
  }, [search])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin.lighten(5),
        children:
          users === undefined
            ? $(Spinner)
            : addkeys([
                $('div', {
                  className: css({
                    display: 'flex',
                    '& > *:not(:last-child)': {
                      marginRight: theme.fib[5],
                    },
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
                      background: theme.bgAdmin,
                      click: () => creatingSet(true),
                    }),
                  ]),
                }),
                $(Table, {
                  head: {
                    firstName: {label: 'First Name', grow: 3},
                    lastName: {label: 'Last Name', grow: 3},
                    gender: {label: 'Gender', grow: 3},
                    createdOn: {label: 'Created', grow: 3},
                    updatedOn: {label: 'Updated', grow: 3},
                  },
                  body: users.map((user) => ({
                    key: user.id,
                    click: () => currentIdSet(user.id),
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
            userSet: () => userList(),
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          current &&
          $(_DashboardUsersView, {
            user: current,
            userSet: (i) => {
              usersSet((x) => x?.map((z) => (z.id === i.id ? i : z)))
              userList()
            },
            close: () => currentIdSet(undefined),
          }),
      }),
    ]),
  })
}

/**
 *
 */
export const _DashboardUsersCreate: FC<{
  userSet: (user: TUser) => void
  close: () => void
}> = ({userSet, close}) => {
  const $userCreate = useEndpoint($UserCreate)
  const form = useForm({
    firstName: '',
    lastName: '',
    email: '',
    gender: undefined as undefined | string,
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
              $(InputSelect, {
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
/**
 *
 */
export const _DashboardUsersView: FC<{
  user: TUser
  userSet: (user: TUser) => void
  close: () => void
}> = ({user, userSet, close}) => {
  const auth = useAuth()
  const $toggleAdmin = useEndpoint($UserToggleAdmin)
  const $userUpdate = useEndpoint($UserUpdate)
  const [merge, mergeSet] = useState(false)
  const [changePass, changePassSet] = useState(false)
  const [adminify, adminifySet] = useState(false)
  const form = useForm({
    ...user,
  })
  const isDifferent = !objectify.compareKeys(user, form.data, [
    'firstName',
    'lastName',
    'gender',
  ])
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        children: addkeys([
          $(TopBar, {
            children: addkeys([
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
                  $(InputSelect, {
                    value: form.data.gender,
                    valueSet: form.link('gender'),
                    options: GENDER_OPTIONS,
                  }),
                ]),
              }),
              $(FormColumn, {
                children: addkeys([
                  $(FormLabel, {label: 'Emails'}),
                  $(Fragment, {
                    children: !user.emails?.length
                      ? $(InputString, {
                          disabled: true,
                          value: userEmails.primary(user) ?? '[unknown]',
                        })
                      : user.emails.map((i) => {
                          return $(InputString, {
                            key: i.value,
                            disabled: true,
                            value: i.value,
                          })
                        }),
                  }),
                ]),
              }),
              $(FormBadge, {
                label: 'Change Password',
                click: () => changePassSet(true),
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
                  $(FormLabel, {label: 'Admin'}),
                  $(FormLabel, {
                    label: user.admin ? 'Yes' : 'No',
                    grow: true,
                  }),
                  $(FormBadge, {
                    label: user.admin ? 'Remove From Admins' : 'Set As Admin',
                    background: theme.bgAdmin,
                    click: () => adminifySet(true),
                  }),
                ]),
              }),
              isDifferent &&
                $(FormBadge, {
                  disabled: $userUpdate.loading,
                  label: $userUpdate.loading ? 'Loading' : 'Save Changes',
                  click: () =>
                    $userUpdate
                      .fetch({...form.data, userId: user.id})
                      .then(userSet),
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
/**
 *
 */
/**
 *
 */
export const _DashboardUsersViewChangePassword: FC<{
  user: TUser
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
