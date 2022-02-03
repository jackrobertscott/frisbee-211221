import {createElement as $, FC, Fragment, useState} from 'react'
import {
  $UserCurrentEmailAdd,
  $UserCurrentEmailRemove,
  $UserCurrentUpdate,
} from '../../endpoints/User'
import {TUser} from '../../schemas/ioUser'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {GENDER_OPTIONS} from '../../utils/constants'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputSelect} from '../Input/InputSelect'
import {InputString} from '../Input/InputString'
import {Modal} from '../Modal'
import {Question} from '../Question'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SettingsAccount: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const [creating, creatingSet] = useState(false)
  const [removing, removingSet] = useState<string>()
  const $userUpdate = useEndpoint($UserCurrentUpdate)
  const $emailRemove = useEndpoint($UserCurrentEmailRemove)
  const form = useForm({
    firstName: '',
    lastName: '',
    ...auth.current?.user,
  })
  return $(Form, {
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
            children: form.data.emails?.map((i) => {
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
                    children:
                      i.primary &&
                      $(FormLabel, {
                        label: 'Primary',
                      }),
                  }),
                  $(FormBadge, {
                    icon: i.verified ? 'thumbs-up' : 'exclamation',
                  }),
                  $(FormBadge, {
                    icon: 'trash-alt',
                    click: () => removingSet(i.value),
                  }),
                ]),
              })
            }),
          }),
        ]),
      }),
      $(FormBadge, {
        disabled: $userUpdate.loading,
        label: $userUpdate.loading ? 'Loading' : 'Save',
        click: () =>
          $userUpdate.fetch(form.data).then((data) => {
            auth.userSet(data)
            toaster.notify('Account updated.')
          }),
      }),
      $(Fragment, {
        children:
          creating &&
          $(_SettingsAccountNewEmail, {
            userSet: (user) => {
              auth.userSet(user)
              form.patch({emails: user.emails})
              creatingSet(false)
            },
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          removing &&
          $(Question, {
            close: () => removingSet(undefined),
            title: 'Remove Email',
            description: `Are you sure you wish to remove "${removing}" from this account?`,
            options: [
              {label: 'Cancel', click: () => removingSet(undefined)},
              {
                label: $emailRemove.loading ? 'Loading' : 'Delete',
                click: () =>
                  $emailRemove
                    .fetch({email: removing})
                    .then((user) => {
                      form.patch({emails: user.emails})
                      auth.userSet(user)
                    })
                    .then(() => removingSet(undefined)),
              },
            ],
          }),
      }),
    ]),
  })
}
/**
 *
 */
const _SettingsAccountNewEmail: FC<{
  userSet: (user: TUser) => void
  close: () => void
}> = ({userSet, close}) => {
  const [value, valueSet] = useState('')
  const $emailAdd = useEndpoint($UserCurrentEmailAdd)
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'New Email',
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
              $(FormLabel, {label: 'Email'}),
              $(InputString, {
                value,
                valueSet,
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $emailAdd.loading,
            label: $emailAdd.loading ? 'Loading' : 'Submit',
            click: () => $emailAdd.fetch({email: value}).then(userSet),
          }),
        ]),
      }),
    ]),
  })
}
