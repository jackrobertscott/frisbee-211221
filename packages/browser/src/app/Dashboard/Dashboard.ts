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
import {SeasonCreate} from '../SeasonCreate'
import {Settings} from '../Settings/Settings'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {FormMenu} from '../Form/FormMenu'
import {FormBadge} from '../Form/FormBadge'
import {hsla} from '../../utils/hsla'
import {fadein} from '../../utils/keyframes'
import {DashboardForum} from './DashboardForum'
import {DashboardLadder} from './DashboardLadder'
import {DashboardFixtures} from './DashboardFixtures'
import {DashboardTeams} from './DashboardTeams'
import {DashboardUsers} from './DashboardUsers'
import {useMedia} from '../Media/useMedia'
import {MenuBar, MenuBarOption, MenuBarShadow, MenuBarSpacer} from '../MenuBar'
import {Router} from '../Router/Router'
import {DashboardReports} from './DashboardReports'
import {TeamSetup} from '../TeamSetup'
import {DashboardPort} from './DashboardPort'
import {Link} from '../Link'
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
  const [teamSetup, teamSetupSet] = useState(false)
  const [settings, settingsSet] = useState(false)
  const bpSmall = theme.fib[13] + theme.fib[11]
  const isSmall = media.width < bpSmall
  return $(Fragment, {
    children: addkeys([
      $(Center, {
        padding: isSmall ? 0 : theme.fib[6],
        breakpoint: bpSmall,
        children: addkeys([
          $('div', {
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
                    children: isSmall
                      ? addkeys([
                          $(TopBarBadge, {
                            icon: 'bars',
                            click: () => openSet(true),
                          }),
                          $(TopBarBadge, {grow: true}),
                        ])
                      : $(TopBarBadge, {
                          grow: true,
                          label: 'Marlow Street',
                        }),
                  }),
                  $(Fragment, {
                    children:
                      media.width >= theme.fib[13] &&
                      $(Fragment, {
                        children: auth.current?.team
                          ? $(TopBarBadge, {
                              label: auth.current?.team.name,
                              background: hsla.digest(auth.current?.team.color),
                            })
                          : $(TopBarBadge, {
                              label: 'Join A Team',
                              click: () => teamSetupSet(true),
                            }),
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
              $(Router, {
                fallback: '/forum',
                routes: [
                  {
                    path: '/forum',
                    label: 'Forum',
                    render: () => $(DashboardForum),
                  },
                  {
                    path: '/fixtures',
                    label: 'Fixtures',
                    render: () => $(DashboardFixtures),
                  },
                  {
                    path: '/ladder',
                    label: 'Ladder',
                    render: () => $(DashboardLadder),
                  },
                  auth.isAdmin() && {
                    path: '/teams',
                    label: 'Teams',
                    render: () => $(DashboardTeams),
                  },
                  auth.isAdmin() && {
                    path: '/users',
                    label: 'Users',
                    render: () => $(DashboardUsers),
                  },
                  auth.isAdmin() && {
                    path: '/reports',
                    label: 'Reports',
                    render: () => $(DashboardReports),
                  },
                  auth.isAdmin() && {
                    path: '/port',
                    label: 'Port',
                    render: () => $(DashboardPort),
                  },
                ],
                render: (children, context) =>
                  addkeys([
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
                                children: context.routes.map((route) => {
                                  return $(MenuBarOption, {
                                    key: route.path,
                                    label: route.label ?? '?',
                                    click: () => go.to(route.path),
                                    active:
                                      route.path === context.current?.path,
                                  })
                                }),
                              }),
                              $(Fragment, {
                                children: !isSmall && $(MenuBarSpacer),
                              }),
                              $(Fragment, {
                                children:
                                  auth.current?.team &&
                                  $(MenuBarOption, {
                                    label: 'Submit Score Report',
                                    click: () => {
                                      reportingSet(true)
                                      openSet(false)
                                    },
                                    background: theme.bgHighlight,
                                    font: theme.bgHighlight.compliment(),
                                  }),
                              }),
                              $(Fragment, {
                                children: isSmall && $(MenuBarSpacer),
                              }),
                            ]),
                          }),
                        }),
                    }),
                    $('div', {
                      children: addkeys([
                        $(Fragment, {children}),
                        $(Fragment, {
                          children:
                            media.width < bpSmall &&
                            $('div', {
                              children: $(_DashboardFooter),
                              className: css({
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                padding: theme.fib[6],
                                background: theme.bgDisabled.string(),
                                borderTop: theme.border(),
                                '& > *:not(:last-child)': {
                                  marginBottom: theme.fib[5],
                                },
                              }),
                            }),
                        }),
                      ]),
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
            ]),
          }),
          $(Fragment, {
            children:
              media.width >= bpSmall &&
              $('div', {
                children: $(_DashboardFooter),
                className: css({
                  display: 'flex',
                  justifyContent: 'center',
                  padding: theme.fib[6],
                  '& > *:not(:last-child)': {
                    marginRight: theme.fib[5],
                  },
                }),
              }),
          }),
        ]),
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
      $(Fragment, {
        children:
          teamSetup &&
          $(TeamSetup, {
            close: () => teamSetupSet(false),
            teamSet: auth.teamSet,
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
  const seasonName = auth.current?.season?.name
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
          icon: seasonName ? undefined : 'sync-alt',
          label: seasonName,
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
                click: () => {
                  creatingSet(true)
                  openSet(false)
                },
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
                    click: () => creatingSet(false),
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
/**
 *
 */
const _DashboardFooter: FC = () => {
  return $(Fragment, {
    children: addkeys([
      $(Link, {
        label: 'Policy & Rules',
        href: 'https://drive.google.com/file/d/1A9ZQTAly2_rSdF6h710ZUYS0tXz8LQzg/view',
        font: theme.fontMinor,
        external: true,
      }),
      $(Link, {
        label: 'Injury & Insurance',
        href: 'https://afda.com/claims-procedure',
        font: theme.fontMinor,
        external: true,
      }),
    ]),
  })
}
