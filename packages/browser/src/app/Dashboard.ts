import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$SeasonListOfUser} from '../endpoints/Season'
import {TSeason} from '../schemas/Season'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {go} from '../utils/go'
import {hsla} from '../utils/hsla'
import {spreadify} from '../utils/spreadify'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {DashboardLadder} from './DashboardLadder'
import {DashboardNews} from './DashboardNews'
import {DashboardSchedule} from './DashboardSchedule'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormList} from './Form/FormList'
import {Modal} from './Modal'
import {Popup} from './Popup'
import {Question} from './Question'
import {useRouter} from './Router/useRouter'
import {SeasonCreate} from './SeasonCreate'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
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
      render: () => $(DashboardSchedule),
    },
    {
      path: '/news',
      title: 'Latest News',
      render: () => $(DashboardNews),
    },
  ])
  return $(Fragment, {
    children: addkeys([
      $(Center, {
        children: $('div', {
          className: css({
            width: 987,
            maxWidth: '100%',
            border: theme.border,
            background: theme.bgColor,
          }),
          children: addkeys([
            $(TopBar, {
              title: 'Dashboard',
              children: addkeys([
                auth.current?.team &&
                  $(TopBarBadge, {
                    label: auth.current?.team.name,
                    color: auth.current?.team.color,
                  }),
                $(_DashboardSeasonBadge),
                $(TopBarBadge, {
                  icon: 'power-off',
                  click: () => logoutSet(true),
                }),
              ]),
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
                  key: route.path,
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
/**
 *
 */
const _DashboardSeasonBadge: FC = () => {
  const auth = useAuth()
  const [seasons, seasonsSet] = useState<TSeason[]>([])
  const [creating, creatingSet] = useState(false)
  const $seasonList = useEndpoint($SeasonListOfUser)
  const reload = () => $seasonList.fetch().then(seasonsSet)
  useEffect(() => {
    reload()
  }, [])
  if (seasons?.length <= 1 && !auth.current?.user.admin) return null
  return $(Fragment, {
    children: addkeys([
      $(Popup, {
        wrap: (openSet) =>
          $(TopBarBadge, {
            icon: 'sync-alt',
            click: () => openSet(true),
          }),
        popup: (openSet) =>
          $(Form, {
            width: 233,
            children: addkeys([
              $(FormList, {
                list: spreadify(seasons).map((i) => ({
                  ...i,
                  label: i.name,
                  click: () => {
                    openSet(false)
                    auth.seasonSet(i)
                  },
                })),
                empty: seasons === undefined ? 'Loading' : 'Empty',
              }),
              auth.current?.user.admin &&
                $(FormButton, {
                  label: 'Create New Season',
                  click: () => creatingSet(true),
                  color: hsla.digest(theme.adminColor),
                }),
            ]),
          }),
      }),
      $(Fragment, {
        children:
          creating &&
          $(Modal, {
            children: addkeys([
              $(TopBar, {
                title: 'New Season',
                children: $(TopBarBadge, {
                  icon: 'times',
                  click: () => creatingSet(false),
                }),
              }),
              $(SeasonCreate, {
                seasonSet: () => {
                  reload()
                  creatingSet(false)
                },
              }),
            ]),
          }),
      }),
    ]),
  })
}
