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
import {ReportCreate} from './ReportCreate'
import {useRouter} from './Router/useRouter'
import {SeasonCreate} from './SeasonCreate'
import {useToaster} from './Toaster/useToaster'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const Dashboard: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const [logout, logoutSet] = useState(false)
  const [reporting, reportingSet] = useState(false)
  const router = useRouter('/news', [
    {
      path: '/news',
      title: 'Latest News',
      render: () => $(DashboardNews),
    },
    {
      path: '/schedule',
      title: 'Game Schedule',
      render: () => $(DashboardSchedule),
    },
    {
      path: '/ladder',
      title: 'Ladder',
      render: () => $(DashboardLadder),
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
              title: auth.current?.season?.name ?? 'Dashboard',
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
                justifyContent: 'space-between',
                borderBottom: theme.border,
                background: theme.bgMinorColor,
              }),
              children: addkeys([
                $('div', {
                  className: css({
                    display: 'flex',
                    '& > *': {
                      borderRight: theme.border,
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
                        padding: theme.padify(theme.inputPadding),
                        color: isCurrent ? theme.color : theme.minorColor,
                        background: isCurrent ? theme.bgColor : undefined,
                        '&:hover': {
                          color: theme.color,
                          background: theme.bgHoverColor,
                        },
                        '&:active': {
                          background: theme.bgPressColor,
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
                    color: theme.minorColor,
                    borderLeft: theme.border,
                    padding: theme.padify(theme.inputPadding),
                    '&:hover': {
                      color: theme.color,
                      background: theme.bgHoverColor,
                    },
                    '&:active': {
                      background: theme.bgPressColor,
                    },
                  }),
                }),
              ]),
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
          click: () => openSet(true),
        }),
        popup: $(Form, {
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
            auth.isAdmin() &&
              $(FormButton, {
                label: 'Create New Season',
                click: () => creatingSet(true),
                color: hsla.digest(theme.bgAdminColor),
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
