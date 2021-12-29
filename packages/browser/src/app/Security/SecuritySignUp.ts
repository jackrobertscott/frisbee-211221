import {createElement as $, FC} from 'react'
import {$SecuritySignUpRegular} from '../../endpoints/Security'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormButton} from '../Form/FormButton'
import {FormLabel} from '../Form/FormLabel'
import {FormLink} from '../Form/FormLink'
import {FormRow} from '../Form/FormRow'
import {InputBoolean} from '../Input/InputBoolean'
import {InputSelect} from '../Input/InputSelect'
import {InputString} from '../Input/InputString'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SecuritySignUp: FC<{
  savedEmailSet: (email: string) => void
}> = ({savedEmailSet}) => {
  const auth = useAuth()
  const $signUp = useEndpoint($SecuritySignUpRegular)
  const form = useForm({
    firstName: '',
    lastName: '',
    gender: undefined as undefined | string,
    email: '',
    password: '',
    termsAccepted: false,
    userAgent: navigator.userAgent,
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
      $(FormButton, {
        disabled: $signUp.loading,
        label: $signUp.loading ? 'Loading' : 'Submit',
        click: () =>
          $signUp
            .fetch({...form.data, gender: form.data.gender!})
            .then((data) => {
              savedEmailSet(data.user.email)
              auth.login(data)
            }),
      }),
      $(FormLink, {
        label: 'Login',
        click: () => go.to('/login'),
      }),
    ]),
  })
}
