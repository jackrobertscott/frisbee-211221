import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $UserCreate,
  $UserList,
  $UserToggleAdmin,
  $UserUpdate,
} from '../../endpoints/User'
import {TUser} from '../../schemas/ioUser'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {objectify} from '../../utils/objectify'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputBoolean} from '../Input/InputBoolean'
import {InputSelect} from '../Input/InputSelect'
import {InputString} from '../Input/InputString'
import {Modal} from '../Modal'
import {Question} from '../Question'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {TopBar} from '../TopBar'
import {TopBarBadge} from '../TopBarBadge'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const DashboardUsers: FC = () => {
  const auth = useAuth()
  const $userList = useEndpoint($UserList)
  const seasonId = auth.current?.season?.id
  const [users, usersSet] = useState<TUser[]>()
  const [currentId, currentIdSet] = useState<string>()
  const [creating, creatingSet] = useState(false)
  const current = currentId && users?.find((i) => currentId === i.id)
  const reload = () => $userList.fetch({}).then(usersSet)
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    if (seasonId) reload()
  }, [seasonId])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin.lighten(5),
        children: addkeys([
          $(FormBadge, {
            label: 'Create User',
            background: theme.bgAdmin,
            click: () => creatingSet(true),
          }),
          $(Fragment, {
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
          }),
        ]),
      }),
      $(Fragment, {
        children:
          creating &&
          $(_DashboardUsersCreate, {
            userSet: () => reload(),
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          current &&
          $(_DashboardUsersView, {
            user: current,
            userSet: (i) =>
              usersSet((x) => x?.map((z) => (z.id === i.id ? i : z))),
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
    password: undefined as undefined | string,
    termsAccepted: false,
  })
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        title: 'New User',
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
                options: [
                  {key: 'male', label: 'Male'},
                  {key: 'female', label: 'Female'},
                ],
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
              $(FormLabel, {label: 'Password'}),
              $(InputString, {
                value: form.data.password,
                valueSet: form.link('password'),
                type: 'password',
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
            title: 'User',
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
                    options: [
                      {key: 'male', label: 'Male'},
                      {key: 'female', label: 'Female'},
                    ],
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Email'}),
                  $(InputString, {
                    value: form.data.email,
                    valueSet: form.link('email'),
                    disabled: true,
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Created'}),
                  $(FormLabel, {
                    label: dayjs(user.createdOn).format(theme.dateFormat),
                    background: theme.bgDisabled,
                    grow: true,
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Last Updated'}),
                  $(FormLabel, {
                    label: dayjs(user.updatedOn).format(theme.dateFormat),
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
                label: 'Confirm',
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
    ]),
  })
}
