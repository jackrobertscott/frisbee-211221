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
/**
 *
 */
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
              '/verify?email=' +
              encodeURIComponent(form.data.email) +
              '&status=password'
            go.to(url)
            toaster.notify('Please check your email inbox.')
          }),
      }),
      $(Link, {
        label: 'Login',
        font: theme.fontMinor,
        href: '/login',
      }),
    ]),
  })
}
