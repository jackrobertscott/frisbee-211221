import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$PostListOfSeason} from '../../endpoints/Post'
import {TPost} from '../../schemas/ioPost'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {PostCreate} from '../PostCreate'
import {useEndpoint} from '../useEndpoint'
import {PostView} from '../PostView'
import {FormBadge} from '../Form/FormBadge'
import {Spinner} from '../Spinner'
import {useMedia} from '../Media/useMedia'
import {TUser} from '../../schemas/ioUser'
/**
 *
 */
export const DashboardForum: FC = () => {
  const auth = useAuth()
  const [viewId, viewIdSet] = useState<string>()
  const [creating, creatingSet] = useState(false)
  const [posts, postsSet] = useState<TPost[]>()
  const [users, usersSet] = useState<TUser[]>()
  const $postList = useEndpoint($PostListOfSeason)
  const postList = () =>
    auth.current?.season &&
    $postList.fetch({seasonId: auth.current?.season.id}).then((i) => {
      postsSet(i.posts)
      usersSet(i.users)
    })
  const postView = viewId ? posts?.find((i) => i.id === viewId) : undefined
  useEffect(() => {
    postList()
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children: addkeys([
          $(FormBadge, {
            label: 'Write A Post...',
            click: () => creatingSet(true),
          }),
          $(Fragment, {
            children:
              posts === undefined
                ? $(Spinner)
                : posts.length
                ? posts.map((post) => {
                    return $(_NewsPost, {
                      key: post.id,
                      post,
                      user: users?.find((i) => i.id === post.userId),
                      click: () => viewIdSet(post.id),
                    })
                  })
                : $('div', {
                    children: 'No Fixtures Yet',
                    className: css({
                      color: theme.fontMinor.string(),
                      padding: theme.padify(theme.fib[4]),
                      textAlign: 'center',
                    }),
                  }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          creating &&
          $(PostCreate, {
            close: () => creatingSet(false),
            done: () => {
              postList()
              creatingSet(false)
            },
          }),
      }),
      $(Fragment, {
        children:
          postView &&
          $(PostView, {
            post: postView,
            user: users?.find((i) => i.id === postView.userId),
            close: () => viewIdSet(undefined),
            reload: () => postList(),
          }),
      }),
    ]),
  })
}
/**
 *
 */
const _NewsPost: FC<{
  post: TPost
  user?: TUser
  click: () => void
}> = ({post, user, click}) => {
  const media = useMedia()
  const previewLength =
    media.width < theme.fib[13] ? theme.fib[9] : theme.fib[12]
  const snippetGet = () => {
    const i = document.createElement('div')
    i.innerHTML = post.content.split('<br>').join(' ')
    const text = i.innerText
    i.remove()
    return text
      .slice(0, previewLength)
      .concat(post.content.length > previewLength ? '...' : '')
  }
  const [snippet, snippetSet] = useState(snippetGet)
  useEffect(() => {
    snippetSet(snippetGet)
  }, [post.content, previewLength])
  return $(Fragment, {
    children: addkeys([
      $('div', {
        onClick: click,
        className: css({
          cursor: 'default',
          whiteSpace: 'pre-line',
          border: theme.border(),
          padding: theme.padify(theme.fib[5]),
          '&:hover': {
            background: theme.bg.hover(),
          },
        }),
        children: addkeys([
          $('div', {
            children: post.title,
            className: css({
              fontSize: theme.fontSizeMajor,
              marginBottom: theme.fib[3],
            }),
          }),
          $('div', {
            children: snippet,
            className: css({
              color: theme.fontMinor.string(),
              marginBottom: theme.fib[3] + 2,
            }),
          }),
          $('div', {
            children: [
              user ? `${user.firstName} ${user.lastName}` : '',
              dayjs(post.createdOn).format('DD/MM/YY h:mma'),
            ]
              .filter((i) => !!i)
              .join(' - '),
            className: css({
              fontSize: theme.fontSizeMinor,
              color: theme.fontMinor.string(),
            }),
          }),
        ]),
      }),
    ]),
  })
}
