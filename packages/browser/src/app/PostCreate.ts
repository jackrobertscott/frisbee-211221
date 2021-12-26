import {createElement as $, FC} from 'react'
import {$PostCreate} from '../endpoints/Post'
import {TPost} from '../schemas/Post'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputString} from './Input/InputString'
import {InputTextarea} from './Input/InputTextarea'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const PostCreate: FC<{
  close: () => void
  done: (post: TPost) => void
}> = ({close, done}) => {
  const $postCreate = useEndpoint($PostCreate)
  const form = useForm({
    title: '',
    content: '',
  })
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        title: 'New Post',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Title'}),
              $(InputString, {
                value: form.data.title,
                valueSet: form.link('title'),
              }),
            ]),
          }),
          $(FormColumn, {
            children: addkeys([
              $(FormLabel, {label: 'Content'}),
              $(InputTextarea, {
                value: form.data.content,
                valueSet: form.link('content'),
              }),
            ]),
          }),
          $(FormButton, {
            disabled: $postCreate.loading,
            label: $postCreate.loading ? 'Loading' : 'Submit',
            click: () => $postCreate.fetch(form.data).then(done),
          }),
        ]),
      }),
    ]),
  })
}
