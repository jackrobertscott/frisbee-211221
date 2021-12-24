import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useState} from 'react'
import {$SeasonCreate} from '../endpoints/Season'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormColumn} from './Form/FormColumn'
import {FormHelp} from './Form/FormHelp'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputBoolean} from './Input/InputBoolean'
import {InputString} from './Input/InputString'
import {Poster} from './Poster'
import {Question} from './Question'
import {TopBar} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const SeasonSetup: FC = () => {
  const auth = useAuth()
  const [logout, logoutSet] = useState(false)
  const $seasonCreate = useEndpoint($SeasonCreate)
  const form = useForm({
    name: '',
    signUpOpen: false,
  })
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
              title: 'New Season',
              options: [
                {
                  icon: 'power-off',
                  click: () => logoutSet(true),
                },
              ],
            }),
            auth.current?.user.admin
              ? $(Form, {
                  children: addkeys([
                    $('div', {
                      children: `A season contains a fixed number of games. A single team will be determined the winner at the end of the season.`,
                      className: css({
                        color: theme.labelColor,
                        margin: `-${theme.fontInset}px 0`,
                      }),
                    }),
                    $(FormRow, {
                      children: addkeys([
                        $(FormLabel, {label: 'Name'}),
                        $(InputString, {
                          value: form.data.name,
                          valueSet: form.link('name'),
                          placeholder: 'e.g. Summer 2022',
                        }),
                      ]),
                    }),
                    $(FormColumn, {
                      children: addkeys([
                        $(FormRow, {
                          children: addkeys([
                            $(FormLabel, {label: 'Sign Up Open'}),
                            $(InputBoolean, {
                              value: form.data.signUpOpen,
                              valueSet: form.link('signUpOpen'),
                            }),
                          ]),
                        }),
                        $(FormHelp, {
                          value:
                            'Teams may be registered in the season while this is active.',
                        }),
                      ]),
                    }),
                    $(FormButton, {
                      label: 'Create',
                      click: () =>
                        $seasonCreate
                          .fetch(form.data)
                          .then((season) => auth.patch({season})),
                    }),
                  ]),
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
