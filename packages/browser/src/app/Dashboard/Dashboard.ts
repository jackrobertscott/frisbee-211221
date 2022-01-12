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
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {FormMenu} from '../Form/FormMenu'
import {FormBadge} from '../Form/FormBadge'
import {hsla} from '../../utils/hsla'
import {fadein, slideright} from '../../utils/keyframes'
import {DashboardNews} from './DashboardNews'
import {DashboardLadder} from './DashboardLadder'
import {DashboardFixtures} from './DashboardFixtures'
import {DashboardTeams} from './DashboardTeams'
import {DashboardUsers} from './DashboardUsers'
import {useMedia} from '../Media/useMedia'
import {MenuBar, MenuBarOption, MenuBarShadow, MenuBarSpacer} from '../MenuBar'
/**
 *
 */
export const Dashboard: FC = () => {
  const auth = useAuth()
  const media = useMedia()
  const toaster = useToaster()
  const [open, openSet] = useState(false)
  const [logout, logoutSet] = useState(false)
  const [reporting, reportingSet] = useState(false)
  const [settings, settingsSet] = useState(false)
  const bpSmall = theme.fib[13] + theme.fib[10]
  const isSmall = media.width < bpSmall
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
        padding: isSmall ? 0 : theme.fib[6],
        breakpoint: bpSmall,
        children: $('div', {
          className: css({
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '100%',
            width: theme.fib[14] + theme.fib[10],
            border: theme.border(),
            background: theme.bg.string(),
            [theme.ltMedia(bpSmall)]: {
              flexGrow: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
            },
          }),
          children: addkeys([
            $(TopBar, {
              children: addkeys([
                $(Fragment, {
                  children:
                    isSmall &&
                    $(TopBarBadge, {
                      icon: 'bars',
                      click: () => openSet(true),
                    }),
                }),
                $(TopBarBadge, {
                  grow: true,
                  label: auth.current?.season?.name ?? 'Dashboard',
                }),
                $(Fragment, {
                  children:
                    auth.current?.team &&
                    media.width >= theme.fib[13] &&
                    $(TopBarBadge, {
                      label: auth.current?.team.name,
                      background: hsla.digest(auth.current?.team.color),
                    }),
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
            $(Fragment, {
              children:
                (open || !isSmall) &&
                $(MenuBarShadow, {
                  click: () => openSet(false),
                  deactivated: !isSmall,
                  children: $(MenuBar, {
                    horizon: !isSmall,
                    bordered: isSmall,
                    children: addkeys([
                      $(Fragment, {
                        children:
                          isSmall &&
                          $(MenuBarOption, {
                            label: 'Menu',
                            background: theme.bg,
                            font: theme.font,
                          }),
                      }),
                      $(Fragment, {
                        children: router.routes.map((route) => {
                          return $(MenuBarOption, {
                            key: route.path,
                            label: route.title,
                            click: () => go.to(route.path),
                            active: route.path === router.current?.path,
                          })
                        }),
                      }),
                      $(Fragment, {children: !isSmall && $(MenuBarSpacer)}),
                      $(MenuBarOption, {
                        label: 'Submit Score Report',
                        click: () => {
                          reportingSet(true)
                          openSet(false)
                        },
                        background: theme.bgHighlight,
                        font: theme.bgHighlight.compliment(),
                      }),
                      $(Fragment, {children: isSmall && $(MenuBarSpacer)}),
                    ]),
                  }),
                }),
            }),
            $('div', {
              children: router.render(),
              className: css({
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                [theme.ltMedia(bpSmall)]: {
                  overflow: 'auto',
                },
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
                children: addkeys([
                  $(TopBarBadge, {
                    grow: true,
                    label: 'New Season',
                  }),
                  $(TopBarBadge, {
                    icon: 'times',
                    click: close,
                  }),
                ]),
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
