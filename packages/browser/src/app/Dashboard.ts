import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useState} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {go} from '../utils/go'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {DashboardLadder} from './DashboardLadder'
import {Form} from './Form/Form'
import {Question} from './Question'
import {useRouter} from './Router/useRouter'
import {TopBar} from './TopBar'
/**
 *
 */
export const Dashboard: FC = () => {
  const auth = useAuth()
  const [logout, logoutSet] = useState(false)
  const router = useRouter('/ladder', [
    {
      path: '/ladder',
      title: 'Ladder',
      render: () => $(DashboardLadder),
    },
    {
      path: '/schedule',
      title: 'Game Schedule',
      render: () => $(Form, {children: 'Game Schedule'}),
    },
    {
      path: '/news',
      title: 'Latest News',
      render: () => $(Form, {children: 'Latest News'}),
    },
  ])
  return $(Fragment, {
    children: addkeys([
      $(Center, {
        children: $('div', {
          className: css({
            width: 610,
            border: theme.border,
          }),
          children: addkeys([
            $(TopBar, {
              title: 'Dashboard',
              options: [{icon: 'power-off', click: () => logoutSet(true)}],
            }),
            $('div', {
              className: css({
                display: 'flex',
                borderBottom: theme.border,
                background: theme.bgMinorColor,
                '& > *': {
                  borderRight: theme.border,
                },
              }),
              children: router.routes.map((route) => {
                return $('div', {
                  children: route.title,
                  onClick: () => go.to(route.path),
                  className: css({
                    cursor: 'default',
                    padding: theme.padify(theme.inputPadding),
                    background:
                      route.path === router.current?.path
                        ? theme.bgColor
                        : undefined,
                    '&:hover': {
                      background: theme.bgHoverColor,
                    },
                    '&:active': {
                      background: theme.bgPressColor,
                    },
                  }),
                })
              }),
            }),
            router.render(),
          ]),
        }),
      }),
      $(Fragment, {
        children:
          logout &&
          $(Question, {
            title: 'Logout',
            description: `Are you sure you wish to sign out of your account?`,
            close: () => logoutSet(false),
            options: [
              {label: 'Cancel', click: () => logoutSet(false)},
              {label: 'Logout', click: () => auth.logout()},
            ],
          }),
      }),
    ]),
  })
}
