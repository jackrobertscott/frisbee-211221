import {createElement as $, FC} from 'react'
import {$UserCurrentUpdate} from '../../endpoints/User'
import {addkeys} from '../../utils/addkeys'
import {GENDER_OPTIONS} from '../../utils/constants'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputSelect} from '../Input/InputSelect'
import {InputString} from '../Input/InputString'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SettingsAccount: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $userUpdate = useEndpoint($UserCurrentUpdate)
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
      $(FormBadge, {
        disabled: $userUpdate.loading,
        label: $userUpdate.loading ? 'Loading' : 'Save',
        click: () =>
          $userUpdate.fetch(form.data).then((data) => {
            auth.userSet(data)
            toaster.notify('Account updated.')
          }),
      }),
    ]),
  })
}
