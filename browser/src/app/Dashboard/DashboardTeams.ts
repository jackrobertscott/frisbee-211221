import {authPoint} from '@shared/auth/authAccess'
import {TTeamListSortKey} from '@shared/endpoints/TeamDef'
import {css} from '@emotion/css'
import {TTeam} from '@shared/schemas/ioTeam'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FeatureDashboardTeamsLoad} from '../../endpoints/Feature'
import {$TeamCreate} from '../../endpoints/Team'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {SIMPLE_COLORS} from '../../utils/colors'
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

export const DashboardTeams: FC = () => {
  const auth = useAuth()
  const pager = usePager()
  const $teamList = useEndpoint($FeatureDashboardTeamsLoad)
  const [search, searchSet] = useState('')
  const [teams, teamsSet] = useState<TTeam[]>()
  const [creating, creatingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const [currentTeam, currentTeamSet] = useState<TTeam>()
  const [sortKey, sortKeySet] = useState<TTeamListSortKey>('division')
  const [sortDirection, sortDirectionSet] = useState<'asc' | 'desc'>('asc')
  const current =
    currentTeam ?? (currentId ? teams?.find((i) => i.id === currentId) : undefined)
  const seasonId = auth.season!.id
  const teamList = ({
    search: nextSearch = search,
    pager: nextPager = pager.data,
  }: {
    search?: string
    pager?: typeof pager.data
  } = {}) =>
    $teamList
      .fetch({
        ...nextPager,
        seasonId,
        search: nextSearch,
        sortBy: sortKey,
        sortDirection,
      })
      .then((i) => {
        teamsSet(i.teams)
        pager.totalSet(i.count)
      })
  const teamListDelay = useSling(500, teamList)
  useEffect(() => {
    teamList()
  }, [pager.data, seasonId, sortKey, sortDirection])
  useEffect(() => {
    if (teams === undefined) return
    if (pager.skip !== 0) {
      pager.dataSet({...pager.data, skip: 0})
      return
    }
    teamListDelay()
  }, [search])
  const toggleSort = (key: TTeamListSortKey) => {
    sortKeySet(key)
    sortDirectionSet((current) => {
      if (sortKey === key) return current === 'asc' ? 'desc' : 'asc'
      return key === 'createdOn' ? 'desc' : 'asc'
    })
    if (pager.skip !== 0) pager.dataSet({...pager.data, skip: 0})
  }
  const getSortIcon = (key: TTeamListSortKey) => {
    if (sortKey !== key) return undefined
    return sortDirection === 'asc' ? 'angle-up' : 'angle-down'
  }
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
                        gap: theme.fib[5],
                      }),
                      children: addkeys([
                        $(InputString, {
                          value: search,
                          valueSet: searchSet,
                          placeholder: 'Search',
                        }),
                        $(Fragment, {
                          children:
                            auth.can(authPoint.teamAdmin) &&
                            $(FormBadge, {
                              noshrink: true,
                              label: 'Create Team',
                              background: theme.bgAdminButton,
                              click: () => creatingSet(true),
                            }),
                        }),
                      ]),
                    }),
                    $(Table, {
                      head: {
                        name: {
                          label: 'Name',
                          grow: 3,
                          click: () => toggleSort('name'),
                          icon: getSortIcon('name'),
                        },
                        division: {
                          label: 'Div',
                          grow: 1,
                          click: () => toggleSort('division'),
                          icon: getSortIcon('division'),
                        },
                        phone: {
                          label: 'Phone',
                          grow: 2,
                          click: () => toggleSort('phone'),
                          icon: getSortIcon('phone'),
                        },
                        email: {
                          label: 'Email',
                          grow: 3,
                          click: () => toggleSort('email'),
                          icon: getSortIcon('email'),
                        },
                        createdOn: {
                          label: 'Created',
                          grow: 2,
                          click: () => toggleSort('createdOn'),
                          icon: getSortIcon('createdOn'),
                        },
                      },
                      body: teams.map((team) => ({
                        key: team.id,
                        click: () => {
                          currentIdSet(team.id)
                          currentTeamSet(undefined)
                        },
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
              const nextPager = {...pager.data, skip: 0}
              searchSet('')
              creatingSet(false)
              currentIdSet(i.id)
              currentTeamSet(i)
              teamList({
                search: '',
                pager: nextPager,
              })
              if (pager.skip !== 0) pager.dataSet(nextPager)
            },
            close: () => creatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          current &&
          $(Fragment, {
            children: auth.can(authPoint.teamAdmin)
              ? $(TeamViewAdmin, {
                  team: current,
                  teamSet: (i) => {
                    currentTeamSet(i)
                    if (i) {
                      currentIdSet(i.id)
                      teamsSet((x) => x?.map((z) => (z.id === i.id ? i : z)))
                    } else currentIdSet(undefined)
                    teamList()
                  },
                  close: () => {
                    currentIdSet(undefined)
                    currentTeamSet(undefined)
                  },
                })
              : $(_DashboardTeamsView, {
                  team: current,
                  close: () => {
                    currentIdSet(undefined)
                    currentTeamSet(undefined)
                  },
                }),
          }),
      }),
    ]),
  })
}

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
