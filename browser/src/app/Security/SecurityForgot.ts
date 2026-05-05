import {createElement as $, FC} from 'react'
import {$SecurityForgot} from '../../endpoints/Security'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {Link} from '../Link'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'

export const SecurityForgot: FC<{email?: string}> = ({email: _email}) => {
  const toaster = useToaster()
  const $send = useEndpoint($SecurityForgot)
  const form = useForm({email: _email ?? ''})
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
            const url =
              '/auth/verify?email=' +
              encodeURIComponent(form.data.email) +
              '&status=password'
            go.to(url)
            toaster.notify(
              'If an account exists for this email, check your inbox for the code.',
            )
          }),
      }),
      $(Link, {
        label: 'Login',
        font: theme.fontMinor,
        href: '/auth/login',
      }),
    ]),
  })
}
