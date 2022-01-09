import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$PostListOfSeason} from '../endpoints/Post'
import {TPost} from '../schemas/ioPost'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {InputString} from './Input/InputString'
import {PostCreate} from './PostCreate'
import {useEndpoint} from './useEndpoint'
import {useSling} from './useThrottle'
import {PostView} from './PostView'
import {FormBadge} from './Form/FormBadge'
import {Spinner} from './Spinner'
/**
 *
 */
export const DashboardNews: FC = () => {
  const auth = useAuth()
  const [search, searchSet] = useState('')
  const [viewId, viewIdSet] = useState<string>()
  const [creating, creatingSet] = useState(false)
  const [posts, postsSet] = useState<TPost[]>()
  const $postList = useEndpoint($PostListOfSeason)
  const postList = () =>
    auth.current?.season &&
    $postList.fetch({seasonId: auth.current?.season.id, search}).then(postsSet)
  const postListDelay = useSling(500, postList)
  const postView = viewId ? posts?.find((i) => i.id === viewId) : undefined
  useEffect(() => postListDelay(), [search])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children: addkeys([
          $(InputString, {
            value: search,
            valueSet: searchSet,
            placeholder: 'Search',
          }),
          auth.isAdmin() &&
            $(FormBadge, {
              label: 'Add Post',
              background: theme.bgAdmin,
              click: () => creatingSet(true),
            }),
          posts === undefined
            ? $(Spinner)
            : posts.map((post) => {
                return $(_NewsPost, {
                  key: post.id,
                  post,
                  click: () => viewIdSet(post.id),
                })
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
                children: post.content
                  .slice(0, 377)
                  .concat(post.content.length > 377 ? '...' : ''),
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
