import {createElement as $, FC} from 'react'
import {$SecurityStatus} from '../../endpoints/Security'
import {addkeys} from '../../utils/addkeys'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
/**
 *
 */
export interface TSecurityStatus {
  status: 'unknown' | 'password' | 'unverified' | 'good'
  email: string
  firstName?: string
}
/**
 *
 */
export const SecurityStatus: FC<{
  email?: string
  statusSet: (data: TSecurityStatus) => void
}> = ({email: _email, statusSet}) => {
  const $status = useEndpoint($SecurityStatus)
  const form = useForm({email: _email ?? ''})
  const submit = () => $status.fetch(form.data).then(statusSet)
  return $(Form, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Email'}),
          $(InputString, {
            value: form.data.email,
            valueSet: form.link('email'),
            enter: submit,
          }),
        ]),
      }),
      $(FormBadge, {
        disabled: $status.loading,
        label: $status.loading ? 'Loading' : 'Submit',
        click: submit,
      }),
    ]),
  })
}
