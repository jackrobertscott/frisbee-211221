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
/**
 *
 */
export const DashboardNews: FC = () => {
  const auth = useAuth()
  const [viewId, viewIdSet] = useState<string>()
  const [creating, creatingSet] = useState(false)
  const [posts, postsSet] = useState<TPost[]>()
  const $postList = useEndpoint($PostListOfSeason)
  const postList = () =>
    auth.current?.season &&
    $postList.fetch({seasonId: auth.current?.season.id}).then(postsSet)
  const postView = viewId ? posts?.find((i) => i.id === viewId) : undefined
  useEffect(() => {
    postList()
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children: addkeys([
          auth.isAdmin() &&
            $(FormBadge, {
              label: 'Add Post',
              background: theme.bgAdmin,
              click: () => creatingSet(true),
            }),
          posts === undefined
            ? $(Spinner)
            : posts.length
            ? posts.map((post) => {
                return $(_NewsPost, {
                  key: post.id,
                  post,
                  click: () => viewIdSet(post.id),
                })
              })
            : $('div', {
                children: 'No Rounds Yet',
                className: css({
                  color: theme.fontMinor.string(),
                  padding: theme.padify(theme.fib[4]),
                  textAlign: 'center',
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
  click: () => void
}> = ({post, click}) => {
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
          border: theme.border(),
          '&:hover': {
            background: theme.bg.hover(),
          },
        }),
        children: addkeys([
          $('div', {
            className: css({
              padding: theme.padify(theme.fib[5]),
              '& > *:not(:last-child)': {
                marginBottom: 5,
              },
            }),
            children: addkeys([
              $('div', {
                children: post.title,
                className: css({
                  fontSize: theme.fib[6],
                }),
              }),
              $('div', {
                children: snippet,
                className: css({
                  color: theme.fontMinor.string(),
                  whiteSpace: 'pre-line',
                }),
              }),
            ]),
          }),
          $('div', {
            children: dayjs(post.createdOn).format(theme.dateFormat),
            className: css({
              borderTop: theme.border(),
              color: theme.fontMinor.string(),
              background: theme.bgMinor.string(),
              padding: theme.padify(theme.fib[5]),
            }),
          }),
        ]),
      }),
    ]),
  })
}
