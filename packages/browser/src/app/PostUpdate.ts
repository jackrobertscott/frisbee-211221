import {createElement as $, FC} from 'react'
import {$PostUpdate} from '../endpoints/Post'
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
export const PostUpdate: FC<{
  post: TPost
  close: () => void
  done: (post: TPost) => void
}> = ({post, close, done}) => {
  const $postUpdate = useEndpoint($PostUpdate)
  const form = useForm({
    title: post.title,
    content: post.content,
  })
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        title: 'Edit Post',
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
                rows: 10,
                value: form.data.content,
                valueSet: form.link('content'),
              }),
            ]),
          }),
          $(FormButton, {
            disabled: $postUpdate.loading,
            label: $postUpdate.loading ? 'Loading' : 'Submit',
            click: () =>
              $postUpdate.fetch({...form.data, postId: post.id}).then(done),
          }),
        ]),
      }),
    ]),
  })
}
