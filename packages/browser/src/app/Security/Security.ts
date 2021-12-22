import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Form} from '../Form/Form'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {useForm} from '../useForm'
/**
 *
 */
export const Security: FC = () => {
  const form = useForm({
    name: '',
  })
  return $('div', {
    className: css({
      padding: 13,
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      // todo: make sure scroll works on short screens...
    }),
    children: $('div', {
      className: css({
        width: 377,
        border: theme.border,
      }),
      children: $(Form, {
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
      }),
    }),
  })
}
