import {createElement as $, FC} from 'react'
import {$PostCreate} from '../endpoints/Post'
import {TPost} from '../schemas/ioPost'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
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
  const auth = useAuth()
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
              $(InputTextarea, {
                rows: 10,
                value: form.data.content,
                valueSet: form.link('content'),
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $postCreate.loading,
            label: $postCreate.loading ? 'Loading' : 'Submit',
            click: () =>
              auth.current?.season &&
              $postCreate
                .fetch({...form.data, seasonId: auth.current.season.id})
                .then(done),
          }),
        ]),
      }),
    ]),
  })
}
