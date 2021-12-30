import {createElement as $, FC} from 'react'
import {$UserUpdate} from '../../endpoints/User'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormButton} from '../Form/FormButton'
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
  const $userUpdate = useEndpoint($UserUpdate)
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
            disabled: true,
            value: form.data.gender,
            valueSet: form.link('gender'),
            options: [
              {key: 'male', label: 'Male'},
              {key: 'female', label: 'Female'},
            ],
          }),
        ]),
      }),
      $(FormButton, {
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
