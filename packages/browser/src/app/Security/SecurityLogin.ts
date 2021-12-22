import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {Form} from '../Form/Form'
import {FormButton} from '../Form/FormButton'
import {FormLabel} from '../Form/FormLabel'
import {FormLink} from '../Form/FormLink'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {useForm} from '../useForm'
/**
 *
 */
export const SecurityLogin: FC = () => {
  const form = useForm({
    email: '',
    password: '',
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
          }),
        ]),
      }),
      $(FormButton, {
        label: 'Submit',
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
