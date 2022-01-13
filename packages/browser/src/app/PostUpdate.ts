import {createElement as $, FC} from 'react'
import {$PostUpdate} from '../endpoints/Post'
import {TPost} from '../schemas/ioPost'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputHTMLLegacy} from './Input/InputHTMLLegacy'
import {InputString} from './Input/InputString'
import {useMedia} from './Media/useMedia'
import {Modal} from './Modal'
import {TopBar, TopBarBadge} from './TopBar'
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
  const media = useMedia()
  const isShort = media.height < theme.fib[13]
  const $postUpdate = useEndpoint($PostUpdate)
  const form = useForm({
    title: post.title,
    content: post.content,
  })
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Edit Post',
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
              $(InputHTMLLegacy, {
                value: form.data.content,
                valueSet: form.link('content'),
                height: isShort ? theme.fib[10] : theme.fib[11],
                maxHeight: isShort ? undefined : theme.fib[12],
              }),
            ]),
          }),
          $(FormBadge, {
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
