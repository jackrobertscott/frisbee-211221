import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$PostList} from '../endpoints/Post'
import {TPost} from '../schemas/Post'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {InputString} from './Input/InputString'
import {PostCreate} from './PostCreate'
import {useEndpoint} from './useEndpoint'
import {useSling} from './useThrottle'
import {PostView} from './PostView'
import {FormSpinner} from './Form/FormSpinner'
/**
 *
 */
export const DashboardNews: FC = () => {
  const auth = useAuth()
  const [search, searchSet] = useState('')
  const [viewId, viewIdSet] = useState<string>()
  const [creating, creatingSet] = useState(false)
  const [posts, postsSet] = useState<TPost[]>()
  const $postList = useEndpoint($PostList)
  const postList = () => $postList.fetch({search}).then(postsSet)
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
            $(FormButton, {
              label: 'Add Post',
              color: hsla.digest(theme.bgAdminColor),
              click: () => creatingSet(true),
            }),
          posts === undefined
            ? $(FormSpinner)
            : posts.map((post) => {
                return $(_NewsPost, {
                  key: post.id,
                  post,
                  click: () => viewIdSet(post.id),
                })
              }),
          posts !== undefined &&
            $(FormButton, {
              icon: 'angle-double-down',
              label: 'Show More',
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
          border: theme.border,
          '&:hover': {
            background: theme.bgHoverColor,
          },
        }),
        children: addkeys([
          $('div', {
            className: css({
              padding: theme.padify(theme.formPadding),
              '& > *:not(:last-child)': {
                marginBottom: 5,
              },
            }),
            children: addkeys([
              $('div', {
                children: post.title,
                className: css({
                  fontSize: 21,
                }),
              }),
              $('div', {
                children: post.content
                  .slice(0, 233)
                  .concat(post.content.length > 233 ? '...' : ''),
                className: css({
                  color: theme.minorColor,
                  whiteSpace: 'pre-line',
                }),
              }),
            ]),
          }),
          $('div', {
            children: dayjs(post.createdOn).format(theme.dateFormat),
            className: css({
              color: theme.minorColor,
              borderTop: theme.border,
              background: hsla.string(0, 0, 0, 0.05),
              padding: theme.padify(theme.formPadding),
            }),
          }),
        ]),
      }),
    ]),
  })
}
