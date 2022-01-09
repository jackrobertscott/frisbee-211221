import {createElement as $, FC} from 'react'
import {$SecuritySignUpRegular} from '../../endpoints/Security'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormHelp} from '../Form/FormHelp'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputBoolean} from '../Input/InputBoolean'
import {InputSelect} from '../Input/InputSelect'
import {InputString} from '../Input/InputString'
import {Link} from '../Link'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SecuritySignUp: FC<{
  email?: string
  savedEmailSet: (email: string) => void
}> = ({email: _email, savedEmailSet}) => {
  const auth = useAuth()
  const $signUp = useEndpoint($SecuritySignUpRegular)
  const form = useForm({
    firstName: '',
    lastName: '',
    gender: undefined as undefined | string,
    email: _email ?? '',
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
            autofocus: true,
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
      $(FormColumn, {
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'T&Cs Accepted'}),
              $(InputBoolean, {
                value: form.data.termsAccepted,
                valueSet: form.link('termsAccepted'),
              }),
            ]),
          }),
          $(FormHelp, {
            children: addkeys([
              'See ',
              $('a', {
                target: '_blank',
                href: 'https://marlowstreetultimate.ultimatecentral.com/insurance',
                children: 'insurance',
              }),
              ' and ',
              $('a', {
                target: '_blank',
                href: 'https://marlowstreetultimate.ultimatecentral.com/policies',
                children: 'policy',
              }),
              ' pages.',
            ]),
          }),
        ]),
      }),
      $(FormBadge, {
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
      $(Link, {
        label: 'Login',
        click: () => go.to('/login'),
      }),
    ]),
  })
}
