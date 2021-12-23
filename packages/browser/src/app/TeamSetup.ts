import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamList} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {InputString} from './Input/InputString'
import {Question} from './Question'
import {TeamCreate} from './TeamCreate'
import {TopBar} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useSling} from './useThrottle'
/**
 *
 */
export const TeamSetup: FC = () => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamList)
  const [loaded, loadedSet] = useState(false)
  const [teams, teamsSet] = useState<TTeam[]>([])
  const [logout, logoutSet] = useState(false)
  const [creating, creatingSet] = useState(false)
  const [search, searchSet] = useState('')
  const teamList = useSling(500, () => {
    $teamList
      .fetch({search})
      .then(teamsSet)
      .then(() => !loaded && loadedSet(true))
  })
  useEffect(() => {
    teamList()
  }, [search])
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
              options: [
                {
                  icon: 'power-off',
                  click: () => logoutSet(true),
                },
              ],
            }),
            $('div', {
              className: css({
                display: 'flex',
                flexDirection: 'column',
                '& > *:not(:last-child)': {
                  borderBottom: theme.border,
                },
              }),
              children: addkeys([
                $(Form, {
                  children: addkeys([
                    $(InputString, {
                      value: search,
                      valueSet: searchSet,
                      placeholder: 'Search',
                    }),
                    $('div', {
                      className: css({
                        border: theme.border,
                        '& > *:not(:last-child)': {
                          borderBottom: theme.border,
                        },
                      }),
                      children:
                        teams.length === 0
                          ? $('div', {
                              children: loaded ? 'Empty' : 'Loading',
                              className: css({
                                opacity: 0.5,
                                textAlign: 'center',
                                padding: theme.padify(theme.inputPadding),
                              }),
                            })
                          : teams.map((team) => {
                              const color = hsla.digest(team.color)
                              return $('div', {
                                key: team.id,
                                children: team.name,
                                onClick: () => auth.patch({team}),
                                className: css({
                                  userSelect: 'none',
                                  background: team.color,
                                  padding: theme.padify(theme.inputPadding),
                                  '&:hover': {
                                    background: hsla.render(
                                      hsla.darken(10, color)
                                    ),
                                  },
                                  '&:active': {
                                    background: hsla.render(
                                      hsla.darken(15, color)
                                    ),
                                  },
                                }),
                              })
                            }),
                    }),
                  ]),
                }),
                $(Form, {
                  background: theme.bgMinorColor,
                  children: addkeys([
                    $(FormButton, {
                      label: 'Create New Team',
                      click: () => creatingSet(true),
                    }),
                  ]),
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
      $(Fragment, {
        children:
          creating &&
          $(TeamCreate, {
            close: () => creatingSet(false),
            done: (team) => auth.patch({team}),
          }),
      }),
    ]),
  })
}
