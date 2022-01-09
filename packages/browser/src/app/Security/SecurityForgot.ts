import {createElement as $, FC, useState} from 'react'
import {
  $SecurityForgotSend,
  $SecurityForgotVerify,
} from '../../endpoints/Security'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {Link} from '../Link'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SecurityForgot: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $send = useEndpoint($SecurityForgotSend)
  const $verify = useEndpoint($SecurityForgotVerify)
  const [emailSent, emailSentSet] = useState(false)
  const form = useForm({
    email: '',
    code: '',
    newPassword: '',
    userAgent: navigator.userAgent,
  })
  if (!emailSent) {
    return $(Form, {
      children: addkeys([
        $(FormRow, {
          children: addkeys([
            $(FormLabel, {label: 'Email'}),
            $(InputString, {
              value: form.data.email,
              valueSet: form.link('email'),
            }),
          ]),
        }),
        $(FormBadge, {
          disabled: $send.loading,
          label: $send.loading ? 'Loading' : 'Submit',
          click: () =>
            $send.fetch(form.data.email).then(() => {
              emailSentSet(true)
              toaster.notify('Please check your email inbox.')
            }),
        }),
        $(Link, {
          label: 'Login',
          click: () => go.to('/login'),
        }),
      ]),
    })
  }
  return $(Form, {
    children: addkeys([
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
          $(FormLabel, {label: 'Code'}),
          $(InputString, {
            value: form.data.code,
            valueSet: form.link('code'),
            placeholder: '0000-0000',
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'New Password'}),
          $(InputString, {
            value: form.data.newPassword,
            valueSet: form.link('newPassword'),
            type: 'password',
          }),
        ]),
      }),
      $(FormBadge, {
        disabled: $verify.loading,
        label: $verify.loading ? 'Loading' : 'Submit & Login',
        click: () => $verify.fetch(form.data).then(auth.login),
      }),
      $(Link, {
        label: 'Login',
        click: () => go.to('/login'),
      }),
    ]),
  })
}
