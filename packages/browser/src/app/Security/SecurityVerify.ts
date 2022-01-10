import {createElement as $, FC, useEffect} from 'react'
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
export const SecurityVerify: FC<{email?: string}> = ({email: _email}) => {
  const auth = useAuth()
  const toaster = useToaster()
  const $send = useEndpoint($SecurityForgotSend)
  const $verify = useEndpoint($SecurityForgotVerify)
  const form = useForm({
    email: _email ?? '',
    code: '',
    newPassword: '',
    userAgent: navigator.userAgent,
  })
  const submit = () => $verify.fetch(form.data).then(auth.login)
  useEffect(() => {
    if (!_email) go.to('/status')
  }, [_email])
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
          $(FormLabel, {label: 'Password'}),
          $(InputString, {
            value: form.data.newPassword,
            valueSet: form.link('newPassword'),
            type: 'password',
            enter: submit,
          }),
        ]),
      }),
      $(FormBadge, {
        disabled: $verify.loading,
        label: $verify.loading ? 'Loading' : 'Submit & Login',
        click: submit,
      }),
      $(Link, {
        label: $send.loading ? 'Loading' : 'Resend Code',
        click: () =>
          $send
            .fetch(form.data.email)
            .then(() => toaster.notify('Please check your email inbox.')),
      }),
      $(Link, {
        label: 'Try New Email',
        click: () => go.to('/status'),
      }),
    ]),
  })
}
