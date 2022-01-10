import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$SeasonListOfUser} from '../../endpoints/Season'
import {TSeason} from '../../schemas/ioSeason'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {spreadify} from '../../utils/spreadify'
import {useAuth} from '../Auth/useAuth'
import {Center} from '../Center'
import {Form} from '../Form/Form'
import {Modal} from '../Modal'
import {Popup} from '../Popup'
import {Question} from '../Question'
import {ReportCreate} from '../ReportCreate'
import {useRouter} from '../Router/useRouter'
import {SeasonCreate} from '../SeasonCreate'
import {Settings} from '../Settings/Settings'
import {useToaster} from '../Toaster/useToaster'
import {TopBar} from '../TopBar'
import {TopBarBadge} from '../TopBarBadge'
import {useEndpoint} from '../useEndpoint'
import {FormMenu} from '../Form/FormMenu'
import {FormBadge} from '../Form/FormBadge'
import {hsla} from '../../utils/hsla'
import {fadein} from '../../utils/keyframes'
import {DashboardNews} from './DashboardNews'
import {DashboardLadder} from './DashboardLadder'
import {DashboardFixtures} from './DashboardFixtures'
import {DashboardTeams} from './DashboardTeams'
import {DashboardUsers} from './DashboardUsers'
/**
 *
 */
export const Dashboard: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const [logout, logoutSet] = useState(false)
  const [reporting, reportingSet] = useState(false)
  const [settings, settingsSet] = useState(false)
  const router = useRouter('/news', [
    {
      path: '/news',
      title: 'News',
      render: () => $(DashboardNews),
    },
    {
      path: '/fixtures',
      title: 'Fixtures',
      render: () => $(DashboardFixtures),
    },
    {
      path: '/ladder',
      title: 'Ladder',
      render: () => $(DashboardLadder),
    },
    auth.isAdmin() && {
      path: '/teams',
      title: 'Teams',
      render: () => $(DashboardTeams),
    },
    auth.isAdmin() && {
      path: '/users',
      title: 'Users',
      render: () => $(DashboardUsers),
    },
  ])
  return $(Fragment, {
    children: addkeys([
      $(Center, {
        children: $('div', {
          className: css({
            maxWidth: '100%',
            width: theme.fib[14] + theme.fib[12],
            border: theme.border(),
            background: theme.bg.string(),
          }),
          children: addkeys([
            $(TopBar, {
              title: auth.current?.season?.name ?? 'Dashboard',
              children: addkeys([
                auth.current?.team &&
                  $(TopBarBadge, {
                    label: auth.current?.team.name,
                    background: hsla.digest(auth.current?.team.color),
                  }),
                $(_DashboardSeasonBadge),
                $(TopBarBadge, {
                  icon: 'cog',
                  tooltip: 'Settings',
                  click: () => settingsSet(true),
                }),
                $(TopBarBadge, {
                  icon: 'power-off',
                  tooltip: 'Logout',
                  click: () => logoutSet(true),
                }),
              ]),
            }),
            $('div', {
              className: css({
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: theme.border(),
                background: theme.bgMinor.string(),
              }),
              children: addkeys([
                $('div', {
                  className: css({
                    display: 'flex',
                    '& > *': {
                      borderRight: theme.border(),
                    },
                  }),
                  children: router.routes.map((route) => {
                    const isCurrent = route.path === router.current?.path
                    return $('div', {
                      key: route.path,
                      children: route.title,
                      onClick: () => go.to(route.path),
                      className: css({
                        userSelect: 'none',
                        padding: theme.padify(theme.fib[4]),
                        color: isCurrent
                          ? theme.font.string()
                          : theme.fontMinor.string(),
                        background: isCurrent ? theme.bg.string() : undefined,
                        '&:hover': {
                          color: theme.font.string(),
                          background: theme.bg.hover(),
                        },
                        '&:active': {
                          background: theme.bg.press(),
                        },
                      }),
                    })
                  }),
                }),
                $('div', {
                  children: 'Submit Score Report',
                  onClick: () => reportingSet(true),
                  className: css({
                    userSelect: 'none',
                    borderLeft: theme.border(),
                    padding: theme.padify(theme.fib[4]),
                    background: theme.bgHighlight.string(),
                    color: theme.fontHighlight.string(),
                    '&:hover': {
                      background: theme.bgHighlight.hover(),
                    },
                    '&:active': {
                      background: theme.bgHighlight.press(),
                    },
                  }),
                }),
              ]),
            }),
            $('div', {
              children: router.render(),
              className: css({
                '& > *': {
                  animation: `150ms linear ${fadein}`,
                },
              }),
            }),
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
      $(Fragment, {
        children:
          reporting &&
          $(ReportCreate, {
            close: () => reportingSet(false),
            done: () => {
              reportingSet(false)
              toaster.notify('Score submitted successfully.')
            },
          }),
      }),
      $(Fragment, {
        children:
          settings &&
          $(Settings, {
            close: () => settingsSet(false),
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
  const [open, openSet] = useState(false)
  const [seasons, seasonsSet] = useState<TSeason[]>([])
  const [creating, creatingSet] = useState(false)
  const $seasonList = useEndpoint($SeasonListOfUser)
  const seasonList = () => $seasonList.fetch().then(seasonsSet)
  useEffect(() => {
    seasonList()
  }, [])
  if (seasons?.length <= 1 && !auth.isAdmin()) return null
  return $(Fragment, {
    children: addkeys([
      $(Popup, {
        open,
        clickOutside: () => openSet(false),
        wrap: $(TopBarBadge, {
          icon: 'sync-alt',
          tooltip: 'Seasons',
          click: () => openSet(true),
        }),
        popup: $(Form, {
          width: theme.fib[11],
          children: addkeys([
            $('div', {
              className: css({
                border: theme.border(),
              }),
              children: $(FormMenu, {
                empty: seasons === undefined ? 'Loading' : 'Empty',
                options: spreadify(seasons).map((i) => ({
                  ...i,
                  label: i.name,
                  click: () => {
                    openSet(false)
                    auth.seasonSet(i)
                  },
                })),
              }),
            }),
            auth.isAdmin() &&
              $(FormBadge, {
                label: 'Create New Season',
                click: () => creatingSet(true),
                background: theme.bgAdmin,
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
                  seasonList()
                  creatingSet(false)
                },
              }),
            ]),
          }),
      }),
    ]),
  })
}
