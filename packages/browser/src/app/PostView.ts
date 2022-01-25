import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {
  createElement as $,
  FC,
  Fragment,
  ReactNode,
  useEffect,
  useState,
} from 'react'
import {TPost} from '../schemas/ioPost'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Modal} from './Modal'
import {TopBar, TopBarBadge} from './TopBar'
import {InputTextarea} from './Input/InputTextarea'
import {useForm} from './useForm'
import {FormColumn} from './Form/FormColumn'
import {useEndpoint} from './useEndpoint'
import {
  $CommentCreate,
  $CommentDelete,
  $CommentListOfPost,
} from '../endpoints/Comment'
import {TComment} from '../schemas/ioComment'
import {TUser} from '../schemas/ioUser'
import {Popup} from './Popup'
import {FormBadge} from './Form/FormBadge'
import {FormMenu} from './Form/FormMenu'
import {useAuth} from './Auth/useAuth'
import {Question} from './Question'
import {CommentEdit} from './CommentEdit'
import {PostUpdate} from './PostUpdate'
import {$PostDelete} from '../endpoints/Post'
import {Spinner} from './Spinner'
import {Link} from './Link'
import {FormRow} from './Form/FormRow'
import {HTML} from './HTML'
/**
 *
 */
export const PostView: FC<{
  post: TPost
  user?: TUser
  close: () => void
  reload: () => void
}> = ({post, user, close, reload}) => {
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
  const form = useForm({content: ''})
  useEffect(() => {
    commentList()
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        width: theme.fib[14],
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(TopBarBadge, {
                grow: true,
                label: 'Post',
              }),
              $(Fragment, {
                children:
                  (auth.isAdmin() || auth.current?.user.id === user?.id) &&
                  addkeys([
                    $(TopBarBadge, {
                      icon: 'wrench',
                      label: 'Edit',
                      click: () => editingSet(true),
                    }),
                    $(TopBarBadge, {
                      icon: 'trash-alt',
                      label: 'Delete',
                      click: () => deletingSet(true),
                    }),
                  ]),
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
              minHeight: theme.fib[12],
              [theme.ltMedia(theme.fib[14])]: {
                minHeight: 'auto',
                flexDirection: 'column',
              },
            }),
            children: addkeys([
              $('div', {
                className: css({
                  padding: theme.fib[6],
                  flexGrow: 1,
                }),
                children: addkeys([
                  $('div', {
                    children: post.title,
                    className: css({
                      fontSize: theme.fib[6],
                      marginBottom: theme.fib[4],
                    }),
                  }),
                  $('div', {
                    children: [
                      user ? `${user.firstName} ${user.lastName}` : '',
                      dayjs(post.createdOn).format(theme.dateFormat),
                    ]
                      .filter((i) => !!i)
                      .join(' - '),
                    className: css({
                      fontSize: theme.fontSizeMinor,
                      color: theme.fontMinor.string(),
                      marginBottom: theme.fib[4],
                    }),
                  }),
                  $(HTML, {
                    html: post.content,
                  }),
                ]),
              }),
              $('div', {
                className: css({
                  flexShrink: 0,
                  width: theme.fib[12],
                  borderLeft: theme.border(),
                  background: theme.bgMinor.string(),
                  padding: theme.fib[5],
                  '& > *:not(:last-child)': {
                    marginBottom: theme.fib[5],
                  },
                  [theme.ltMedia(theme.fib[14])]: {
                    borderLeft: 'none',
                    borderTop: theme.border(),
                    width: '100%',
                  },
                }),
                children: addkeys([
                  $(FormColumn, {
                    children: addkeys([
                      $(InputTextarea, {
                        value: form.data.content,
                        valueSet: form.link('content'),
                        placeholder: 'Write comment...',
                        rows: 3,
                      }),
                      $(FormBadge, {
                        disabled: $commentCreate.loading,
                        label: $commentCreate.loading ? 'Loading' : 'Post',
                        click: () =>
                          $commentCreate
                            .fetch({...form.data, postId: post.id})
                            .then(() => commentList())
                            .then(() => form.reset()),
                      }),
                    ]),
                  }),
                  comments === undefined
                    ? $(Spinner)
                    : $(Fragment, {
                        children: comments
                          .filter((i) => !i.commentParentId)
                          .map((comment) => {
                            const user = users?.find((i) => {
                              return i.id === comment.userId
                            })
                            return $(_PostViewComment, {
                              key: comment.id,
                              post,
                              comment,
                              user,
                              reload: () => commentList(),
                              replies: comments
                                .filter((i) => i.commentParentId === comment.id)
                                .map((i) => ({
                                  comment: i,
                                  user: users?.find((x) => x.id === i.userId),
                                })),
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
                label: $postDelete.loading ? 'Loading' : 'Delete',
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
  post: TPost
  comment: TComment
  replies?: Array<{comment: TComment; user?: TUser}>
  user?: TUser
  reload: () => void
}> = ({post, comment, replies, user, reload}) => {
  const [replying, replyingSet] = useState(false)
  const [deleting, deletingSet] = useState<TComment>()
  const [editing, editingSet] = useState<TComment>()
  const $commentDelete = useEndpoint($CommentDelete)
  const $commentCreate = useEndpoint($CommentCreate)
  const form = useForm({content: ''})
  return $(Fragment, {
    children: addkeys([
      $(FormColumn, {
        children: addkeys([
          $(_PostViewCommentContent, {
            comment,
            user,
            action: $(Link, {
              label: `${replying ? 'Hide' : 'Reply'}(${replies?.length})`,
              click: () => replyingSet((i) => !i),
            }),
            options: [
              {
                label: 'Edit',
                click: () => editingSet(comment),
              },
              {
                label: 'Delete',
                click: () => deletingSet(comment),
              },
            ],
          }),
          replying &&
            $(FormRow, {
              children: addkeys([
                $('div', {
                  className: css({
                    flexShrink: 0,
                    width: theme.fib[5],
                    background: theme.bgMinor.darken(10).string(),
                    border: theme.border(),
                  }),
                }),
                $(FormColumn, {
                  grow: true,
                  shrink: true,
                  children: addkeys([
                    $(Fragment, {
                      children: replies
                        ?.sort((a, b) => {
                          const order =
                            new Date(a.comment.createdOn).valueOf() -
                            new Date(b.comment.createdOn).valueOf()
                          return order
                        })
                        .map((i) => {
                          return $(_PostViewCommentContent, {
                            key: i.comment.id,
                            comment: i.comment,
                            user: i.user,
                            options: [
                              {
                                label: 'Edit',
                                click: () => editingSet(i.comment),
                              },
                              {
                                label: 'Delete',
                                click: () => deletingSet(i.comment),
                              },
                            ],
                          })
                        }),
                    }),
                    $(FormRow, {
                      children: addkeys([
                        $(InputTextarea, {
                          value: form.data.content,
                          valueSet: form.link('content'),
                          placeholder: 'Reply...',
                          rows: 1,
                        }),
                        $(FormBadge, {
                          icon: $commentCreate.loading
                            ? 'spinner'
                            : 'paper-plane',
                          disabled: $commentCreate.loading,
                          label: 'Post',
                          click: () =>
                            $commentCreate
                              .fetch({
                                ...form.data,
                                postId: post.id,
                                commentParentId: comment.id,
                              })
                              .then(() => reload())
                              .then(() => form.reset()),
                        }),
                      ]),
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
          $(CommentEdit, {
            comment: editing,
            close: () => editingSet(undefined),
            done: () => {
              editingSet(undefined)
              reload()
            },
          }),
      }),
      $(Fragment, {
        children:
          deleting &&
          $(Question, {
            close: () => deletingSet(undefined),
            title: 'Delete',
            description: 'Are you sure you wish to delete this comment?',
            options: [
              {label: 'Cancel', click: () => deletingSet(undefined)},
              {
                label: $commentDelete.loading ? 'Loading' : 'Delete',
                click: () =>
                  $commentDelete
                    .fetch({commentId: deleting.id})
                    .then(() => reload())
                    .then(() => deletingSet(undefined)),
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
const _PostViewCommentContent: FC<{
  comment: TComment
  user?: TUser
  action?: ReactNode
  options: Array<{
    label: string
    click: () => void
  }>
}> = ({comment, user, action, options}) => {
  const auth = useAuth()
  const [open, openSet] = useState(false)
  return $('div', {
    className: css({
      border: theme.border(),
      background: theme.bg.string(),
      padding: theme.padify(theme.fib[4]),
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
        className: css({
          display: 'flex',
          flexWrap: 'wrap',
          color: theme.fontMinor.string(),
          fontSize: theme.fontSizeMinor,
          marginTop: theme.fib[4] - theme.fontInset * 2,
          '& > *:not(:last-child)': {
            marginRight: theme.fib[4],
          },
        }),
        children: addkeys([
          $(Fragment, {
            children: action,
          }),
          $(Fragment, {
            children:
              user &&
              $('div', {
                children: `${user.firstName} ${user.lastName}`.trim(),
              }),
          }),
          $('div', {
            children: dayjs(comment.createdOn).format('h:mma DD/MM/YY'),
          }),
        ]),
      }),
      $(Fragment, {
        children:
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
                options: options.map((i) => ({
                  ...i,
                  click: () => {
                    i.click()
                    openSet(false)
                  },
                })),
              }),
            }),
          }),
      }),
    ]),
  })
}
