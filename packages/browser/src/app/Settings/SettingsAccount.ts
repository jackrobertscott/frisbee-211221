import {createElement as $, FC, Fragment, useState} from 'react'
import {
  $UserCurrentEmailAdd,
  $UserCurrentEmailCodeResend,
  $UserCurrentEmailPrimarySet,
  $UserCurrentEmailRemove,
  $UserCurrentEmailVerify,
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
  const [verifying, verifyingSet] = useState<string>()
  const [primaryify, primaryifySet] = useState<string>()
  const $userUpdate = useEndpoint($UserCurrentUpdate)
  const $emailRemove = useEndpoint($UserCurrentEmailRemove)
  const $primarySet = useEndpoint($UserCurrentEmailPrimarySet)
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
                    children: i.verified
                      ? i.primary
                        ? $(FormLabel, {label: 'Primary'})
                        : $(FormBadge, {
                            icon: 'arrow-up',
                            click: () => primaryifySet(i.value),
                          })
                      : $(FormBadge, {
                          icon: 'exclamation',
                          click: () => verifyingSet(i.value),
                        }),
                  }),
                  $(Fragment, {
                    children:
                      !i.primary &&
                      $(FormBadge, {
                        icon: 'trash-alt',
                        click: () => removingSet(i.value),
                      }),
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
          $(_SettingsAccountEmailNew, {
            userSet: (user, email) => {
              auth.userSet(user)
              form.patch({emails: user.emails})
              creatingSet(false)
              verifyingSet(email)
            },
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          verifying &&
          $(_SettingsAccountEmailVerify, {
            email: verifying,
            userSet: (user) => {
              auth.userSet(user)
              form.patch({emails: user.emails})
              verifyingSet(undefined)
              toaster.notify('Email verified.')
            },
            close: () => verifyingSet(undefined),
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
                label: $emailRemove.loading ? 'Loading' : 'Delete',
                click: () =>
                  $emailRemove.fetch({email: removing}).then((user) => {
                    form.patch({emails: user.emails})
                    auth.userSet(user)
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
            description: `Are you sure you wish to make "${primaryify}" your primary email?`,
            options: [
              {label: 'Cancel', click: () => primaryifySet(undefined)},
              {
                label: $primarySet.loading ? 'Loading' : 'Set As Primary',
                click: () =>
                  $primarySet.fetch({email: primaryify}).then((user) => {
                    form.patch({emails: user.emails})
                    auth.userSet(user)
                    primaryifySet(undefined)
                    toaster.notify('Email set as primary.')
                  }),
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
const _SettingsAccountEmailNew: FC<{
  userSet: (user: TUser, email: string) => void
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
            click: () =>
              $emailAdd.fetch({email: value}).then((i) => userSet(i, value)),
          }),
        ]),
      }),
    ]),
  })
}
/**
 *
 */
const _SettingsAccountEmailVerify: FC<{
  email: string
  userSet: (user: TUser) => void
  close: () => void
}> = ({email, userSet, close}) => {
  const toaster = useToaster()
  const [value, valueSet] = useState('')
  const $emailVerify = useEndpoint($UserCurrentEmailVerify)
  const $resend = useEndpoint($UserCurrentEmailCodeResend)
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Verify Email',
          }),
          $(TopBarBadge, {
            icon: $resend.loading ? 'spinner' : undefined,
            label: $resend.loading ? 'Sending' : 'Resend Code',
            click: () =>
              $resend
                .fetch({email})
                .then(() => toaster.notify('Code sent to your inbox.')),
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
                value: email,
                disabled: true,
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Code'}),
              $(InputString, {
                value,
                valueSet,
                placeholder: '0000-0000',
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $emailVerify.loading,
            label: $emailVerify.loading ? 'Loading' : 'Submit',
            click: () => $emailVerify.fetch({email, code: value}).then(userSet),
          }),
        ]),
      }),
    ]),
  })
}
