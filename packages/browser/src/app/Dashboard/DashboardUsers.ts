import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {
  ChangeEvent,
  createElement as $,
  FC,
  Fragment,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  $UserCreate,
  $UserImport,
  $UserList,
  $UserToggleAdmin,
  $UserUpdate,
} from '../../endpoints/User'
import {TSeason} from '../../schemas/ioSeason'
import {TUser} from '../../schemas/ioUser'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {GENDER_OPTIONS} from '../../utils/constants'
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
import {useMedia} from '../Media/useMedia'
import {Modal} from '../Modal'
import {Pager} from '../Pager/Pager'
import {usePager} from '../Pager/usePager'
import {Poster} from '../Poster'
import {Question} from '../Question'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
import {useSling} from '../useThrottle'
/**
 *
 */
export const DashboardUsers: FC = () => {
  const auth = useAuth()
  const media = useMedia()
  const pager = usePager()
  const $userList = useEndpoint($UserList)
  const [search, searchSet] = useState('')
  const [users, usersSet] = useState<TUser[]>()
  const [creating, creatingSet] = useState(false)
  const [importing, importingSet] = useState(false)
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
        children: addkeys([
          $(Fragment, {
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
                          label: 'Create User',
                          background: theme.bgAdmin,
                          click: () => creatingSet(true),
                        }),
                        $(Fragment, {
                          children:
                            media.width >= theme.fib[13] &&
                            $(FormBadge, {
                              label: 'Import CSV',
                              background: theme.bgAdmin,
                              click: () => importingSet(true),
                            }),
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
            userSet: (i) =>
              usersSet((x) => x?.map((z) => (z.id === i.id ? i : z))),
            close: () => currentIdSet(undefined),
          }),
      }),
      $(Fragment, {
        children:
          importing &&
          auth.current?.season &&
          $(_DashboardUsersImport, {
            done: () => {
              userList()
              importingSet(false)
            },
            close: () => importingSet(false),
            season: auth.current.season,
          }),
      }),
    ]),
  })
}
/**
 *
 */
export const _DashboardUsersImport: FC<{
  done: () => void
  close: () => void
  season: TSeason
}> = ({done, close, season}) => {
  const ref = useRef<HTMLElement>()
  const [csv, csvSet] = useState<File>()
  const $userImport = useEndpoint($UserImport)
  return $(Fragment, {
    children: addkeys([
      $('input', {
        ref,
        type: 'file',
        accept: '.csv',
        className: css({
          display: 'none',
        }),
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          if (event.target.files?.length) csvSet(event.target.files[0])
        },
      }),
      $(Modal, {
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(TopBarBadge, {
                grow: true,
                label: 'Import CSV',
              }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
          }),
          !csv
            ? $(Form, {
                background: theme.bgMinor,
                children: $(FormBadge, {
                  label: 'Select File',
                  click: () => ref.current?.click(),
                }),
              })
            : $(Fragment, {
                children: addkeys([
                  $(Poster, {
                    title: 'Ready To Upload',
                    description: csv.name,
                  }),
                  $(Form, {
                    children: addkeys([
                      $(FormBadge, {
                        disabled: $userImport.loading,
                        icon: $userImport.loading ? 'spinner' : undefined,
                        label: $userImport.loading ? 'Loading' : 'Upload',
                        click: () => {
                          const data = new FormData()
                          data.set('csv', csv)
                          data.set('seasonId', season.id)
                          $userImport.fetch(data).then(done)
                        },
                      }),
                      $(FormBadge, {
                        label: 'Change File',
                        click: () => ref.current?.click(),
                      }),
                    ]),
                  }),
                ]),
              }),
        ]),
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
                    disabled: true,
                  }),
                ]),
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
    ]),
  })
}
