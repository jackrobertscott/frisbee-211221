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
import {
  $CommentCreate,
  $CommentDelete,
  $CommentListOfPost,
} from '../endpoints/Comment'
import {TComment} from '../schemas/Comment'
import {FormSpinner} from './Form/FormSpinner'
import {TUser} from '../schemas/User'
import {Popup} from './Popup'
import {FormBadge} from './Form/FormBadge'
import {FormMenu} from './Form/FormMenu'
import {useAuth} from './Auth/useAuth'
import {Question} from './Question'
import {CommentEdit} from './CommentEdit'
import {PostUpdate} from './PostUpdate'
import {$PostDelete} from '../endpoints/Post'
/**
 *
 */
export const PostView: FC<{
  post: TPost
  close: () => void
  reload: () => void
}> = ({post, close, reload}) => {
  const auth = useAuth()
  const [{comments, users}, stateSet] = useState<{
    comments?: TComment[]
    users?: TUser[]
  }>({})
  const [editing, editingSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const $commentCreate = useEndpoint($CommentCreate)
  const $commentList = useEndpoint($CommentListOfPost)
  const $postDelete = useEndpoint($PostDelete)
  const commentList = () => $commentList.fetch({postId: post.id}).then(stateSet)
  const formComment = useForm({
    content: '',
  })
  useEffect(() => {
    commentList()
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        close,
        width: 610 + 377 + 26,
        children: addkeys([
          $(TopBar, {
            title: 'Post',
            children: addkeys([
              auth.isAdmin() &&
                $(TopBarBadge, {
                  icon: 'wrench',
                  label: 'Edit',
                  color: theme.bgAdminColor,
                  click: () => editingSet(true),
                }),
              auth.isAdmin() &&
                $(TopBarBadge, {
                  icon: 'trash-alt',
                  label: 'Delete',
                  color: theme.bgAdminColor,
                  click: () => deletingSet(true),
                }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
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
                  padding: 21,
                  flexShrink: 0,
                  borderLeft: theme.border,
                  background: theme.bgMinorColor,
                  '& > *:not(:last-child)': {
                    marginBottom: theme.formPadding,
                  },
                }),
                children: addkeys([
                  $(FormColumn, {
                    children: addkeys([
                      $(InputTextarea, {
                        value: formComment.data.content,
                        valueSet: formComment.link('content'),
                        placeholder: 'Write comment...',
                        rows: 3,
                      }),
                      $(FormButton, {
                        label: 'Post',
                        click: () =>
                          $commentCreate
                            .fetch({...formComment.data, postId: post.id})
                            .then(() => commentList())
                            .then(() => formComment.reset()),
                      }),
                    ]),
                  }),
                  comments === undefined
                    ? $(FormSpinner)
                    : $(Fragment, {
                        children: comments.map((comment) => {
                          const user = users?.find(
                            (i) => i.id === comment.userId
                          )
                          return $(_PostViewComment, {
                            key: comment.id,
                            comment,
                            user,
                            reload: () => commentList(),
                          })
                        }),
                      }),
                ]),
              }),
            ]),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          editing &&
          $(PostUpdate, {
            post,
            close: () => editingSet(false),
            done: () => {
              editingSet(false)
              reload()
            },
          }),
      }),
      $(Fragment, {
        children:
          deleting &&
          $(Question, {
            close: () => deletingSet(false),
            title: 'Delete',
            description: 'Are you sure you wish to delete this comment?',
            options: [
              {label: 'Cancel', click: () => deletingSet(false)},
              {
                label: 'Delete',
                click: () =>
                  $postDelete.fetch({postId: post.id}).then(() => reload()),
              },
            ],
          }),
      }),
    ]),
  })
}
/**
 *
 */
const _PostViewComment: FC<{
  comment: TComment
  user?: TUser
  reload: () => void
}> = ({comment, user, reload}) => {
  const auth = useAuth()
  const [open, openSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const [editing, editingSet] = useState(false)
  const $commentDelete = useEndpoint($CommentDelete)
  return $(Fragment, {
    children: addkeys([
      $('div', {
        className: css({
          border: theme.border,
          background: theme.bgColor,
          padding: theme.padify(theme.inputPadding),
          position: 'relative',
          '&:hover .options': {
            opacity: 1,
          },
        }),
        children: addkeys([
          $('div', {
            children: comment.content,
          }),
          $('div', {
            children: `${user?.firstName ?? ''} ${user?.lastName ?? ''} ${dayjs(
              comment.createdOn
            ).format(theme.dateFormat)}`.trim(),
            className: css({
              color: theme.minorColor,
              marginTop: theme.inputPadding - theme.fontInset * 2,
            }),
          }),
          (auth.isAdmin() || auth.current?.user.id === comment.userId) &&
            $('div', {
              className: css({
                top: 8,
                right: 8,
                position: 'absolute',
                opacity: open ? 1 : 0,
              }).concat(' options'),
              children: $(Popup, {
                open,
                clickOutside: () => openSet(false),
                wrap: $(FormBadge, {
                  icon: 'bars',
                  click: () => openSet(true),
                  padding: 5,
                }),
                popup: $(FormMenu, {
                  options: [
                    {
                      label: 'Edit',
                      click: () => {
                        editingSet(true)
                        openSet(false)
                      },
                    },
                    {
                      label: 'Delete',
                      click: () => {
                        deletingSet(true)
                        openSet(false)
                      },
                    },
                  ],
                }),
              }),
            }),
        ]),
      }),
      $(Fragment, {
        children:
          editing &&
          $(CommentEdit, {
            comment,
            close: () => editingSet(false),
            done: () => {
              editingSet(false)
              reload()
            },
          }),
      }),
      $(Fragment, {
        children:
          deleting &&
          $(Question, {
            close: () => deletingSet(false),
            title: 'Delete',
            description: 'Are you sure you wish to delete this comment?',
            options: [
              {label: 'Cancel', click: () => deletingSet(false)},
              {
                label: 'Delete',
                click: () =>
                  $commentDelete
                    .fetch({commentId: comment.id})
                    .then(() => reload()),
              },
            ],
          }),
      }),
    ]),
  })
}
