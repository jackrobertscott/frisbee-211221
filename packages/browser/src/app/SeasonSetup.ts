import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useState} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Poster} from './Poster'
import {Question} from './Question'
import {SeasonCreate} from './SeasonCreate'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
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
            background: theme.bgColor,
          }),
          children: addkeys([
            $(TopBar, {
              title: 'New Season',
              children: $(TopBarBadge, {
                icon: 'power-off',
                click: () => logoutSet(true),
              }),
            }),
            auth.isAdmin()
              ? $(SeasonCreate, {
                  seasonSet: auth.seasonSet,
                })
              : $(Poster, {
                  title: 'Season Not Ready',
                  description: `Looks like you got here too early. Please come back when the new season registrations are open.`,
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
