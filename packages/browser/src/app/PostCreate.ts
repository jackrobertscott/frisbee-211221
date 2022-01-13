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
import {InputBoolean} from './Input/InputBoolean'
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
export const PostCreate: FC<{
  close: () => void
  done: (post: TPost) => void
}> = ({close, done}) => {
  const auth = useAuth()
  const media = useMedia()
  const isShort = media.height < theme.fib[13]
  const $postCreate = useEndpoint($PostCreate)
  const form = useForm({
    title: '',
    content: '',
    sendEmail: false,
  })
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'New Post',
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
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Email To Captains'}),
              $(InputBoolean, {
                value: form.data.sendEmail,
                valueSet: form.link('sendEmail'),
                grow: false,
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
