import {createElement as $, FC} from 'react'
import {$SecuritySignUp} from '../../endpoints/Security'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {GENDER_OPTIONS} from '../../utils/constants'
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
import {useToaster} from '../Toaster/useToaster'
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
  const toaster = useToaster()
  const $signUp = useEndpoint($SecuritySignUp)
  const form = useForm({
    firstName: '',
    lastName: '',
    gender: undefined as undefined | string,
    email: _email ?? '',
    termsAccepted: false,
    userAgent: navigator.userAgent,
  })
  return $(Form, {
    children: addkeys([
      $(Link, {
        label: 'Already Signed Up? Go to Login',
        font: theme.fontMinor,
        href: '/auth/welcome',
      }),
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
            options: GENDER_OPTIONS,
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
            .fetch({
              ...form.data,
              gender: form.data.gender!,
              seasonId: auth.season?.id,
            })
            .then(() => {
              savedEmailSet(form.data.email)
              const url =
                '/verify?email=' +
                encodeURIComponent(form.data.email) +
                '&status=password'
              toaster.notify('Please check your email inbox.', 8000)
              go.to(url)
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
