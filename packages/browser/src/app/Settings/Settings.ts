import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Modal} from '../Modal'
import {SideBar} from '../SideBar'
import {TopBar} from '../TopBar'
import {TopBarBadge} from '../TopBarBadge'
import {useLocalRouter} from '../useLocalRouter'
import {SettingsAccount} from './SettingsAccount'
import {SettingsMembers} from './SettingsMembers'
import {SettingsPassword} from './SettingsPassword'
import {SettingsTeam} from './SettingsTeam'
/**
 *
 */
export const Settings: FC<{close: () => void}> = ({close}) => {
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
    {
      path: '/team',
      title: 'Team',
      render: () => $(SettingsTeam),
    },
    {
      path: '/members',
      title: 'Members',
      render: () => $(SettingsMembers),
    },
  ])
  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        title: 'Settings',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $('div', {
        className: css({
          display: 'flex',
        }),
        children: addkeys([
          $(SideBar, {
            options: router.routes.map((i) => ({
              key: i.path,
              label: i.title,
              click: () => router.go(i.path),
              active: i.path === router.current.path,
            })),
          }),
          $('div', {
            children: router.render(),
            className: css({
              flexGrow: 1,
              background: theme.bgMinor.string(),
            }),
          }),
        ]),
      }),
    ]),
  })
}
