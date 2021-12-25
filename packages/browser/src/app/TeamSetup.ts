import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamList} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormList} from './Form/FormList'
import {InputString} from './Input/InputString'
import {Question} from './Question'
import {TeamCreate} from './TeamCreate'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
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
    if (!auth.current?.season?.id) throw new Error('Season does not exist.')
    $teamList
      .fetch({seasonId: auth.current?.season?.id, search})
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
            background: theme.bgColor,
          }),
          children: addkeys([
            $(TopBar, {
              title: 'Join A Team',
              children: $(TopBarBadge, {
                icon: 'power-off',
                click: () => logoutSet(true),
              }),
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
                    $(FormList, {
                      empty: loaded ? 'Empty' : 'Loading',
                      list: teams.map((i) => ({
                        id: i.id,
                        label: i.name,
                        color: i.color,
                        click: () => auth.teamSet(i),
                      })),
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
          auth.current?.season &&
          $(TeamCreate, {
            seasonId: auth.current?.season.id,
            close: () => creatingSet(false),
            done: (team) => auth.teamSet(team),
          }),
      }),
    ]),
  })
}
