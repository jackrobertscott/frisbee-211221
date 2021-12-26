import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {TPost} from '../schemas/Post'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {InputTextarea} from './Input/InputTextarea'
import {useForm} from './useForm'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {FormButton} from './Form/FormButton'
import {useEndpoint} from './useEndpoint'
import {$CommentCreate, $CommentListOfPost} from '../endpoints/Comment'
import {TComment} from '../schemas/Comment'
import {FormSpinner} from './Form/FormSpinner'
import {TUser} from '../schemas/User'
/**
 *
 */
export const PostView: FC<{
  post: TPost
  close: () => void
}> = ({post, close}) => {
  const [{comments, users}, stateSet] = useState<{
    comments?: TComment[]
    users?: TUser[]
  }>({})
  const $commentCreate = useEndpoint($CommentCreate)
  const $commentList = useEndpoint($CommentListOfPost)
  const commentList = () => $commentList.fetch({postId: post.id}).then(stateSet)
  const form = useForm({
    content: '',
  })
  useEffect(() => {
    commentList()
  }, [])
  return $(Modal, {
    width: 610 + 377 + 26,
    children: addkeys([
      $(TopBar, {
        title: 'Post',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $('div', {
        className: css({
          display: 'flex',
        }),
        children: addkeys([
          $('div', {
            className: css({
              padding: 21,
              flexGrow: 1,
            }),
            children: addkeys([
              $('div', {
                children: post.title,
                className: css({
                  fontSize: 21,
                  marginBottom: 5,
                }),
              }),
              $('div', {
                children: dayjs(post.createdOn).format(theme.dateFormat),
                className: css({
                  color: theme.minorColor,
                  marginBottom: theme.formPadding,
                }),
              }),
              $('div', {
                children: post.content,
                className: css({
                  whiteSpace: 'pre-line',
                }),
              }),
            ]),
          }),
          $('div', {
            className: css({
              width: 377,
              flexShrink: 0,
              borderLeft: theme.border,
              background: theme.bgMinorColor,
            }),
            children: $(Form, {
              children: addkeys([
                $(FormColumn, {
                  children: addkeys([
                    $(InputTextarea, {
                      value: form.data.content,
                      valueSet: form.link('content'),
                      placeholder: 'Write comment...',
                      rows: 3,
                    }),
                    $(FormButton, {
                      label: 'Post',
                      click: () =>
                        $commentCreate
                          .fetch({...form.data, postId: post.id})
                          .then(() => commentList())
                          .then(() => form.reset()),
                    }),
                  ]),
                }),
                comments === undefined
                  ? $(FormSpinner)
                  : $(Fragment, {
                      children: comments.map((comment) => {
                        const user = users?.find((i) => i.id === comment.userId)
                        return $('div', {
                          key: comment.id,
                          className: css({
                            border: theme.border,
                            padding: theme.padify(theme.inputPadding),
                          }),
                          children: addkeys([
                            $('div', {
                              children: comment.content,
                            }),
                            $('div', {
                              children: `${user?.firstName ?? ''} ${
                                user?.lastName ?? ''
                              } ${dayjs(comment.createdOn).format(
                                theme.dateFormat
                              )}`.trim(),
                              className: css({
                                color: theme.minorColor,
                                marginTop:
                                  theme.inputPadding - theme.fontInset * 2,
                              }),
                            }),
                          ]),
                        })
                      }),
                    }),
              ]),
            }),
          }),
        ]),
      }),
    ]),
  })
}
