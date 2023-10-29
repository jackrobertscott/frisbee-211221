import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {TSeason} from '../../../../shared/src/schemas/ioSeason'
import faceofwillPng from '../../assets/faceofwill.png'
import {$SeasonList} from '../../endpoints/Season'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {go} from '../../utils/go'
import {hsla} from '../../utils/hsla'
import {fadein} from '../../utils/keyframes'
import {spreadify} from '../../utils/spreadify'
import {useAuth} from '../Auth/useAuth'
import {Center} from '../Center'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormMenu} from '../Form/FormMenu'
import {Link} from '../Link'
import {useMedia} from '../Media/useMedia'
import {MenuBar, MenuBarOption, MenuBarShadow, MenuBarSpacer} from '../MenuBar'
import {Modal} from '../Modal'
import {Popup} from '../Popup'
import {Question} from '../Question'
import {ReportCreate} from '../ReportCreate'
import {Router} from '../Router/Router'
import {SeasonCreate} from '../SeasonCreate'
import {Settings} from '../Settings/Settings'
import {TeamSetup} from '../TeamSetup'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {DashboardFixtures} from './DashboardFixtures'
import {DashboardLadder} from './DashboardLadder'
import {DashboardPort} from './DashboardPort'
import {DashboardReports} from './DashboardReports'
import {DashboardTeams} from './DashboardTeams'
import {DashboardUsers} from './DashboardUsers'
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
              [theme.ltMedia(bpSmall)]: {
                flexGrow: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
              },
            }),
            children: addkeys([
              $('div', {
                className: css({
                  position: 'relative',
                  marginRight: 'auto',
                  marginLeft: theme.fib[6],
                  marginBottom: -theme.fib[5],
                  marginTop: -theme.fib[3],
                }),
                children: $('img', {
                  src: faceofwillPng,
                  className: css({
                    height: theme.fib[9],
                    rotate: '-15deg',
                  }),
                }),
              }),
              $('div', {
                className: css({
                  flexGrow: 1,
                  flexDirection: 'column',
                  display: 'flex',
                  border: theme.border(),
                  background: theme.bg.string(),
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
                        children: auth.current
                          ? auth.current.team
                            ? $(TopBarBadge, {
                                label: auth.current.team.name,
                                background: hsla.digest(
                                  auth.current.team.color
                                ),
                              })
                            : $(TopBarBadge, {
                                label: 'Join A Team',
                                click: () => teamSetupSet(true),
                              })
                          : $(TopBarBadge, {
                              label: 'Login / Sign Up',
                              click: () => go.to('/auth/welcome'),
                            }),
                      }),
                      $(_DashboardSeasonBadge),
                      $(Fragment, {
                        children:
                          auth.current &&
                          addkeys([
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
                    ]),
                  }),
                  $(Router, {
                    fallback: '/fixtures',
                    routes: [
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
                      // {
                      //   path: '/forum',
                      //   label: 'Forum',
                      //   render: () => $(DashboardForum),
                      // },
                      {
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
                                        click: () => {
                                          go.to(route.path)
                                          if (open) openSet(false)
                                        },
                                        active:
                                          route.path === context.current?.path,
                                      })
                                    }),
                                  }),
                                  $(MenuBarOption, {
                                    label: 'Shop',
                                    click: () =>
                                      (window.location.href =
                                        'https://marlow-street-ultimate.square.site/s/shop?fbclid=IwAR21rulDg_KiLtXACWJmW1bm08W0xoVqRHLie3L12-bg0_0Rtqu8ObB2LDs'),
                                  }),
                                  $(Fragment, {
                                    children: !isSmall && $(MenuBarSpacer),
                                  }),
                                  $(Fragment, {
                                    children: $(MenuBarOption, {
                                      label: 'Submit Score Report',
                                      font: theme.bgHighlight.compliment(),
                                      background: theme.bgHighlight,
                                      click: () => {
                                        if (auth.current) {
                                          if (auth.current.team) {
                                            reportingSet(true)
                                            openSet(false)
                                          } else {
                                            const message =
                                              'Please join a team to submit a score report.'
                                            toaster.notify(message)
                                            teamSetupSet(true)
                                          }
                                        } else {
                                          const message =
                                            'Please sign in to submit a score report.'
                                          toaster.notify(message)
                                          go.to('/auth')
                                        }
                                      },
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
                          className: css({
                            display: 'flex',
                            flexDirection: 'column',
                            flexGrow: 1,
                            [theme.ltMedia(bpSmall)]: {
                              overflow: 'auto',
                            },
                            '& > *': {
                              animation: `150ms linear ${fadein}`,
                            },
                          }),
                          children: addkeys([
                            $(Fragment, {children}),
                            $(Fragment, {
                              children:
                                media.width < bpSmall &&
                                $('div', {
                                  children: $(_DashboardFooter),
                                  className: css({
                                    flexGrow: 1,
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
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
                        }),
                      ]),
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
              {
                label: 'Logout',
                click: () => {
                  auth.logout()
                  logoutSet(false)
                },
              },
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
  const $seasonList = useEndpoint($SeasonList)
  const seasonList = () => $seasonList.fetch({}).then(seasonsSet)
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
          tooltip: 'Seasons',
          label: auth.season!.name,
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
