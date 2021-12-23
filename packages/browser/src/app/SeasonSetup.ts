import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useState} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Question} from './Question'
import {TopBar} from './TopBar'
/**
 *
 */
export const SeasonSetup: FC = () => {
  const auth = useAuth()
  const [logout, logoutSet] = useState(false)
  return $(Fragment, {
    children: addkeys([
      $(Center, {
        children: $('div', {
          className: css({
            width: 377,
            border: theme.border,
          }),
          children: addkeys([
            $(TopBar, {
              title: 'Season',
              options: [
                {
                  icon: 'power-off',
                  click: () => logoutSet(true),
                },
              ],
            }),
            $('div', {
              className: css({
                padding: 34,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }),
              children: addkeys([
                $('div', {
                  children: 'Season Not Ready',
                  className: css({
                    fontSize: 21,
                  }),
                }),
                $('div', {
                  children: `Looks like you got here too early. Please come back when the new season registrations are open.`,
                  className: css({
                    opacity: 0.5,
                    marginTop: 5,
                    width: 233,
                  }),
                }),
              ]),
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
    ]),
  })
}
