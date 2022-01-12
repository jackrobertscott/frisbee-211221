import {createElement as $, FC} from 'react'
import {$CommentUpdate} from '../endpoints/Comment'
import {TComment} from '../schemas/ioComment'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {InputTextarea} from './Input/InputTextarea'
import {Modal} from './Modal'
import {TopBar, TopBarBadge} from './TopBar'
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
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Edit Comment',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(InputTextarea, {
            value: form.data.content,
            valueSet: form.link('content'),
          }),
          $(FormBadge, {
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
