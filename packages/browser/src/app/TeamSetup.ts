import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useState} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {Question} from './Question'
import {TopBar} from './TopBar'
/**
 *
 */
export const TeamSetup: FC = () => {
  const auth = useAuth()
  const [open, openSet] = useState(false)
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
              title: 'Join A Team',
            }),
            $(Form, {
              children: addkeys([
                $(FormButton, {
                  label: 'Setup Your Team',
                  click: () => openSet(true),
                }),
                $(FormButton, {
                  label: 'Logout',
                  click: () => logoutSet(true),
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
