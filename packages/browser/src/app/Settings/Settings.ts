import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Modal} from '../Modal'
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
    width: 610,
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
          $('div', {
            className: css({
              minWidth: 233,
              maxWidth: 233,
              borderRight: theme.border,
              background: theme.bgMinorColor,
              paddingBottom: 89,
              '& > *': {
                borderBottom: theme.border,
              },
            }),
            children: router.routes.map((route) => {
              const isCurrent = route.path === router.current.path
              return $('div', {
                key: route.path,
                children: `${isCurrent ? '- ' : ''}${route.title}`,
                onClick: () => router.go(route.path),
                className: css({
                  userSelect: 'none',
                  padding: theme.padify(theme.inputPadding),
                  background: isCurrent ? theme.bgColor : undefined,
                  color: isCurrent ? theme.color : theme.minorColor,
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
          $('div', {
            children: router.render(),
            className: css({
              flexGrow: 1,
            }),
          }),
        ]),
      }),
    ]),
  })
}
