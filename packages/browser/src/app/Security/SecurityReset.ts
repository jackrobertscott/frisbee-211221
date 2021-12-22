import {createElement as $, FC} from 'react'
import {addkeys} from '../../utils/addkeys'
import {Form} from '../Form/Form'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {useForm} from '../useForm'
/**
 *
 */
export const SecurityReset: FC = () => {
  const form = useForm({
    name: '',
  })
  return $(Form, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Name'}),
          $(InputString, {
            value: form.data.name,
            valueSet: form.link('name'),
          }),
        ]),
      }),
    ]),
  })
}
