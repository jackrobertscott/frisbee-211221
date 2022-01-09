import {createElement as $, FC} from 'react'
import {$UserChangePassword} from '../../endpoints/User'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {useToaster} from '../Toaster/useToaster'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export const SettingsPassword: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $changePassword = useEndpoint($UserChangePassword)
  const form = useForm({
    oldPassword: '',
    newPassword: '',
  })
  return $(Form, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Old Password'}),
          $(InputString, {
            value: form.data.oldPassword,
            valueSet: form.link('oldPassword'),
            type: 'password',
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'New Password'}),
          $(InputString, {
            value: form.data.newPassword,
            valueSet: form.link('newPassword'),
            type: 'password',
          }),
        ]),
      }),
      $(FormBadge, {
        disabled: $changePassword.loading,
        label: $changePassword.loading ? 'Loading' : 'Submit',
        click: () =>
          $changePassword
            .fetch(form.data)
            .then(() => toaster.notify('Password changed.')),
      }),
    ]),
  })
}
