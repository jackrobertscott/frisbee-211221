import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {$SecurityLoginPassword} from '../../endpoints/Security'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormButton} from '../Form/FormButton'
import {FormLabel} from '../Form/FormLabel'
import {FormLink} from '../Form/FormLink'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SecurityLogin: FC<{
  savedEmail?: string
  savedEmailSet: (email: string) => void
}> = ({savedEmail, savedEmailSet}) => {
  const auth = useAuth()
  const $login = useEndpoint($SecurityLoginPassword)
  const form = useForm({
    email: savedEmail ?? '',
    password: '',
    userAgent: navigator.userAgent,
  })
  const submit = () =>
    $login.fetch(form.data).then((data) => {
      savedEmailSet(data.user.email)
      auth.login(data)
    })
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
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Password'}),
          $(InputString, {
            value: form.data.password,
            valueSet: form.link('password'),
            type: 'password',
            enter: submit,
          }),
        ]),
      }),
      $(FormButton, {
        disabled: $login.loading,
        label: $login.loading ? 'Loading' : 'Submit',
        click: submit,
      }),
      $('div', {
        className: css({
          display: 'flex',
          justifyContent: 'center',
          '& > *:not(:last-child)': {
            marginRight: theme.formPadding,
          },
        }),
        children: addkeys([
          $(FormLink, {
            label: 'Create Account',
            click: () => go.to('/sign-up'),
          }),
          $(FormLink, {
            label: 'Forgot Password?',
            click: () => go.to('/forgot-password'),
          }),
        ]),
      }),
    ]),
  })
}
