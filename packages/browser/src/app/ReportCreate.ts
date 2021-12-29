import {createElement as $, FC} from 'react'
import {$TeamCreate} from '../endpoints/Team'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const ReportCreate: FC<{
  close: () => void
  done: () => void // todo...
}> = ({close, done}) => {
  const $create = useEndpoint($TeamCreate) // todo...
  const form = useForm({
    name: '',
  })
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        title: 'Score Report',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
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
          $(FormButton, {
            disabled: $create.loading,
            label: $create.loading ? 'Loading' : 'Submit',
          }),
        ]),
      }),
    ]),
  })
}
