import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamCreate, $TeamListOfSeason} from '../../endpoints/Team'
import {TTeam} from '../../schemas/ioTeam'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {SIMPLE_COLORS} from '../../utils/colors'
import {go} from '../../utils/go'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputSimpleColor} from '../Input/InputSimpleColor'
import {InputString} from '../Input/InputString'
import {Modal} from '../Modal'
import {Pager} from '../Pager/Pager'
import {usePager} from '../Pager/usePager'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {TeamViewAdmin} from '../TeamViewAdmin'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'
import {useSling} from '../useThrottle'
/**
 *
 */
export const DashboardTeams: FC = () => {
  const auth = useAuth()
  const pager = usePager()
  const $teamList = useEndpoint($TeamListOfSeason)
  const [search, searchSet] = useState('')
  const [teams, teamsSet] = useState<TTeam[]>()
  const [creating, creatingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const current = currentId && teams?.find((i) => i.id === currentId)
  const seasonId = auth.season!.id
  const teamList = () =>
    $teamList.fetch({...pager.data, seasonId, search}).then((i) => {
      teamsSet(i.teams)
      pager.totalSet(i.count)
    })
  const teamListDelay = useSling(500, teamList)
  useEffect(() => {
    teamList()
  }, [pager.data, seasonId])
  useEffect(() => {
    if (teams !== undefined) teamListDelay()
  }, [search])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(Fragment, {
            children:
              teams === undefined
                ? $(Spinner)
                : addkeys([
                    $('div', {
                      className: css({
                        display: 'flex',
                        '& > *:not(:last-child)': {
                          marginRight: theme.fib[5],
                        },
                      }),
                      children: addkeys([
                        $(InputString, {
                          value: search,
                          valueSet: searchSet,
                          placeholder: 'Search',
                        }),
                        $(Fragment, {
                          children:
                            auth.isAdmin() &&
                            $(FormBadge, {
                              noshrink: true,
                              label: 'Create Team',
                              background: theme.bgAdmin,
                              click: () => creatingSet(true),
                            }),
                        }),
                      ]),
                    }),
                    $(Table, {
                      head: {
                        name: {label: 'Name', grow: 3},
                        division: {label: 'Div', grow: 1},
                        phone: {label: 'Phone', grow: 2},
                        email: {label: 'Email', grow: 3},
                        createdOn: {label: 'Created', grow: 2},
                      },
                      body: teams
                        .sort(({division: a}, {division: b}) => {
                          if (typeof a !== 'number' && typeof b !== 'number')
                            return 0
                          if (typeof a !== 'number') return 1
                          if (typeof b !== 'number') return -1
                          return a - b
                        })
                        .map((team) => ({
                          key: team.id,
                          click: () => currentIdSet(team.id),
                          data: {
                            name: {
                              value: team.name,
                              color: team.color,
                            },
                            division: {value: team.division},
                            phone: {value: team.phone},
                            email: {value: team.email},
                            createdOn: {
                              value: dayjs(team.createdOn).format('DD/MM/YYYY'),
                            },
                          },
                        })),
                    }),
                    $(Pager, {
                      ...pager,
                      count: teams?.length,
                    }),
                  ]),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          creating &&
          $(_DashboardTeamsCreate, {
            teamSet: (i) => {
              creatingSet(false)
              currentIdSet(i.id)
              teamList()
            },
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          current &&
          $(Fragment, {
            children: auth.isAdmin()
              ? $(TeamViewAdmin, {
                  team: current,
                  teamSet: (i) => {
                    if (i)
                      teamsSet((x) => x?.map((z) => (z.id === i.id ? i : z)))
                    else teamList()
                  },
                  close: () => currentIdSet(undefined),
                })
              : $(_DashboardTeamsView, {
                  team: current,
                  close: () => currentIdSet(undefined),
                }),
          }),
      }),
    ]),
  })
}
/**
 *
 */
const _DashboardTeamsView: FC<{
  team: TTeam
  close: () => void
}> = ({team, close}) => {
  return $(Modal, {
    close,
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Team',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Name'}),
              $(FormLabel, {
                grow: true,
                label: team.name,
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Phone'}),
              $(FormLabel, {
                grow: true,
                label: team.phone ?? '...',
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Email'}),
              $(FormLabel, {
                grow: true,
                label: team.email ?? '...',
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Division'}),
              $(FormLabel, {
                grow: true,
                label: team.division?.toString(),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  })
}
/**
 *
 */
const _DashboardTeamsCreate: FC<{
  teamSet: (team: TTeam) => void
  close: () => void
}> = ({teamSet, close}) => {
  const auth = useAuth()
  const $teamCreate = useEndpoint($TeamCreate)
  const form = useForm({
    name: '',
    phone: '',
    email: '',
    color: SIMPLE_COLORS[0].string(),
    seasonId: auth.season!.id,
  })
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'New Team',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(FormColumn, {
            children: addkeys([
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Name'}),
                  $(InputString, {
                    value: form.data.name,
                    valueSet: form.link('name'),
                  }),
                ]),
              }),
              $(FormColumn, {
                children: addkeys([
                  $(FormLabel, {
                    label: 'Public Contact Details',
                    background: theme.bgMinor,
                  }),
                  $(FormRow, {
                    children: addkeys([
                      $(FormLabel, {label: 'Phone'}),
                      $(InputString, {
                        value: form.data.phone,
                        valueSet: form.link('phone'),
                      }),
                    ]),
                  }),
                  $(FormRow, {
                    children: addkeys([
                      $(FormLabel, {label: 'Email'}),
                      $(InputString, {
                        value: form.data.email,
                        valueSet: form.link('email'),
                      }),
                    ]),
                  }),
                ]),
              }),
              $(FormColumn, {
                children: addkeys([
                  $(FormLabel, {label: 'Color'}),
                  $(InputSimpleColor, {
                    value: form.data.color,
                    valueSet: form.link('color'),
                  }),
                ]),
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: $teamCreate.loading,
            label: $teamCreate.loading ? 'Loading' : 'Submit',
            click: () => $teamCreate.fetch(form.data).then(teamSet),
          }),
        ]),
      }),
    ]),
  })
}
