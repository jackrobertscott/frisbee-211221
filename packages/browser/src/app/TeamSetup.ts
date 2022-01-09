import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$MemberListOfUser, $MemberRequestCreate} from '../endpoints/Member'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TMember} from '../schemas/ioMember'
import {TTeam} from '../schemas/ioTeam'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Center} from './Center'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormMenu} from './Form/FormMenu'
import {InputString} from './Input/InputString'
import {Question} from './Question'
import {TeamCreate} from './TeamCreate'
import {useToaster} from './Toaster/useToaster'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useSling} from './useThrottle'
/**
 *
 */
export const TeamSetup: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $memberRequest = useEndpoint($MemberRequestCreate)
  const $membersOfUser = useEndpoint($MemberListOfUser)
  const [loaded, loadedSet] = useState(false)
  const [teams, teamsSet] = useState<TTeam[]>([])
  const [logout, logoutSet] = useState(false)
  const [creating, creatingSet] = useState(false)
  const [teamRequested, teamRequestedSet] = useState<TTeam>()
  const [membersOfUser, membersOfUserSet] = useState<TMember[]>()
  const [search, searchSet] = useState('')
  const teamList = useSling(500, () => {
    if (!auth.current?.season?.id) throw new Error('Season does not exist.')
    $teamList
      .fetch({seasonId: auth.current?.season?.id, search})
      .then(teamsSet)
      .then(() => !loaded && loadedSet(true))
  })
  const memberList = () =>
    $membersOfUser.fetch().then((data) => membersOfUserSet(data.members))
  useEffect(() => teamList(), [search])
  useEffect(() => {
    memberList()
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Center, {
        children: $('div', {
          className: css({
            width: 377,
            border: theme.border(),
            background: theme.bg.string(),
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
                  borderBottom: theme.border(),
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
                        border: theme.border(),
                      }),
                      children: $(FormMenu, {
                        empty: loaded ? 'No Teams Exist Yet' : 'Loading',
                        options: teams.map((i) => ({
                          id: i.id,
                          label: i.name,
                          color: i.color,
                          click: () => teamRequestedSet(i),
                          sublabel:
                            membersOfUser &&
                            membersOfUser.findIndex((x) => x.teamId === i.id) >=
                              0
                              ? 'Pending'
                              : undefined,
                        })),
                      }),
                    }),
                  ]),
                }),
                $(Form, {
                  background: theme.bgMinor,
                  children: addkeys([
                    $(FormBadge, {
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
      $(Fragment, {
        children:
          teamRequested &&
          $(Question, {
            close: () => teamRequestedSet(undefined),
            title: `Join ${teamRequested.name}`,
            description: `Are you sure you wish to join ${teamRequested.name}? The team captain will need to approve your request.`,
            options: [
              {label: 'Cancel', click: () => teamRequestedSet(undefined)},
              {
                label: 'Join Team',
                click: () =>
                  $memberRequest.fetch(teamRequested.id).then(() => {
                    const message =
                      'Request successfully created. Please wait while the captain approves the request.'
                    toaster.notify(message)
                    memberList()
                    teamRequestedSet(undefined)
                  }),
              },
            ],
          }),
      }),
    ]),
  })
}
