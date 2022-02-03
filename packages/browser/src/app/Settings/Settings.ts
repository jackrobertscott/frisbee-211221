import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useState} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Modal} from '../Modal'
import {MenuBar, MenuBarOption, MenuBarShadow, MenuBarSpacer} from '../MenuBar'
import {TopBar, TopBarBadge} from '../TopBar'
import {useLocalRouter} from '../useLocalRouter'
import {SettingsAccount} from './SettingsAccount'
import {SettingsMembers} from './SettingsMembers'
import {SettingsPassword} from './SettingsPassword'
import {SettingsTeam} from './SettingsTeam'
import {useMedia} from '../Media/useMedia'
import {useAuth} from '../Auth/useAuth'
/**
 *
 */
export const Settings: FC<{close: () => void}> = ({close}) => {
  const auth = useAuth()
  const media = useMedia()
  const bpSmall = theme.fib[13]
  const isSmall = media.width < bpSmall
  const [open, openSet] = useState(false)
  const router = useLocalRouter('/account', [
    {
      path: '/account',
      title: 'Account',
      render: () => $(SettingsAccount),
    },
    {
      path: '/password',
      title: 'Change Password',
      render: () => $(SettingsPassword),
    },
    !!auth.current?.team && {
      path: '/team',
      title: 'Team',
      render: () => $(SettingsTeam),
    },
    !!auth.current?.team && {
      path: '/members',
      title: 'Members',
      render: () => $(SettingsMembers),
    },
  ])
  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(Fragment, {
            children:
              isSmall &&
              $(TopBarBadge, {
                icon: open ? 'arrow-left' : 'bars',
                click: () => openSet((i) => !i),
              }),
          }),
          $(TopBarBadge, {
            grow: true,
            label: 'Settings',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $('div', {
        className: css({
          display: 'flex',
          position: 'relative',
        }),
        children: addkeys([
          (open || !isSmall) &&
            $(MenuBarShadow, {
              click: () => openSet(false),
              deactivated: !isSmall,
              children: $(MenuBar, {
                children: addkeys([
                  $(Fragment, {
                    children: router.routes.map((i) => {
                      return $(MenuBarOption, {
                        key: i.path,
                        label: i.title,
                        click: () => {
                          router.go(i.path)
                          if (open) openSet(false)
                        },
                        active: i.path === router.current.path,
                      })
                    }),
                  }),
                  $(MenuBarSpacer),
                ]),
              }),
            }),
          $('div', {
            children: router.render(),
            className: css({
              flexGrow: 1,
              overflow: 'hidden',
              background: theme.bgMinor.string(),
            }),
          }),
        ]),
      }),
    ]),
  })
}
