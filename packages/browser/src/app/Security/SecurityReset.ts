import {createElement as $, FC} from 'react'
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
export const SecurityReset: FC = () => {
  const form = useForm({
    email: '',
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
      $(FormButton, {
        label: 'Submit',
      }),
      $(FormLink, {
        label: 'Login',
        click: () => go.to('/login'),
      }),
    ]),
  })
}
