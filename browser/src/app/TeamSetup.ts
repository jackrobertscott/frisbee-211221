import {css} from '@emotion/css'
import {TTeam} from '@shared/schemas/ioTeam'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FeatureTeamSetupLoad} from '../endpoints/Feature'
import {$MemberRequestCreate} from '../endpoints/Member'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormMenu} from './Form/FormMenu'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {Poster} from './Poster'
import {Question} from './Question'
import {Spinner} from './Spinner'
import {TeamCreate} from './TeamCreate'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useSling} from './useThrottle'

export const TeamSetup: FC<{
  close: () => void
  teamSet: (team: TTeam) => void
}> = ({close, teamSet}) => {
  const auth = useAuth()
  const toaster = useToaster()
  const $teamSetupLoad = useEndpoint($FeatureTeamSetupLoad)
  const $memberRequest = useEndpoint($MemberRequestCreate)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [pendingTeam, pendingTeamSet] = useState<TTeam>()
  const [logout, logoutSet] = useState(false)
  const [creating, creatingSet] = useState(false)
  const [teamRequested, teamRequestedSet] = useState<TTeam>()
  const [search, searchSet] = useState('')
  const teamList = (nextSearch = search) =>
    $teamSetupLoad
      .fetch({seasonId: auth.season!.id, search: nextSearch})
      .then((data) => {
        teamsSet(data.teams)
        pendingTeamSet(data.pendingTeam)
      })
  const teamListDelay = useSling(300, () => teamList())
  useEffect(() => {
    teamList('')
  }, [])
  useEffect(() => {
    if (teams === undefined) return
    teamListDelay()
  }, [search])
  const normalize = (data: string) => data.toLowerCase().split(' ').join('')
  const searchNormalized = normalize(search)
  const normalizeSearch = (data: string) =>
    normalize(data).includes(searchNormalized)
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        width: theme.fib[12] + theme.fib[8],
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(TopBarBadge, {
                grow: true,
                label: 'Join A Team',
              }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
          }),
          $(Fragment, {
            children:
              teams === undefined
                ? $(Form, {
                    children: $(Spinner),
                  })
                : pendingTeam
                  ? $(Poster, {
                      title: 'Request Pending',
                      description: `You have requested to join ${pendingTeam.name}. Please wait while the team captain responds to your request.`,
                    })
                  : $('div', {
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
                                empty: 'No Teams Found',
                                options: teams
                                  .filter((i) => normalizeSearch(i.name))
                                  .map((i) => ({
                                    id: i.id,
                                    label: i.name,
                                    color: i.color,
                                    click: () => teamRequestedSet(i),
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
          }),
        ]),
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
            seasonId: auth.season!.id,
            close: () => creatingSet(false),
            done: (i) => {
              teamSet(i)
              toaster.notify('Team Created.')
              creatingSet(false)
              close()
            },
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
                    teamList('')
                    teamRequestedSet(undefined)
                  }),
              },
            ],
          }),
      }),
    ]),
  })
}
