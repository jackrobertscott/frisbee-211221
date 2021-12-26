import {createElement as $, FC} from 'react'
import {$CommentUpdate} from '../endpoints/Comment'
import {TComment} from '../schemas/Comment'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {InputTextarea} from './Input/InputTextarea'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const CommentEdit: FC<{
  comment: TComment
  close: () => void
  done: (comment: TComment) => void
}> = ({comment, close, done}) => {
  const $commentUpdate = useEndpoint($CommentUpdate)
  const form = useForm({
    content: comment.content,
  })
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        title: 'Edit Comment',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
        children: addkeys([
          $(InputTextarea, {
            value: form.data.content,
            valueSet: form.link('content'),
          }),
          $(FormButton, {
            disabled: $commentUpdate.loading,
            label: $commentUpdate.loading ? 'Loading' : 'Submit',
            click: () =>
              $commentUpdate
                .fetch({...form.data, commentId: comment.id})
                .then(done),
          }),
        ]),
      }),
    ]),
  })
}
