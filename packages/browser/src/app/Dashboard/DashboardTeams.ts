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
import {useMedia} from '../Media/useMedia'
import {Modal} from '../Modal'
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
  const media = useMedia()
  const $teamList = useEndpoint($TeamListOfSeason)
  const seasonId = auth.current?.season?.id
  const [search, searchSet] = useState('')
  const [count, countSet] = useState<number>()
  const [teams, teamsSet] = useState<TTeam[]>()
  const [creating, creatingSet] = useState(false)
  const [currentId, currentIdSet] = useState<string>()
  const current = currentId && teams?.find((i) => i.id === currentId)
  const teamList = () =>
    seasonId &&
    $teamList.fetch({seasonId, search}).then((i) => {
      teamsSet(i.teams)
      countSet(i.count)
    })
  const teamListDelay = useSling(500, teamList)
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    else teamList()
  }, [auth.current, seasonId])
  useEffect(() => {
    if (teams !== undefined) teamListDelay()
  }, [search])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin.lighten(5),
        children: addkeys([
          $('div', {
            className: css({
              display: 'flex',
              '& > *:not(:last-child)': {
                marginRight: theme.fib[5],
              },
            }),
            children: addkeys([
              $(Fragment, {
                children:
                  !!teams?.length &&
                  $(InputString, {
                    value: search,
                    valueSet: searchSet,
                    placeholder: 'Search',
                  }),
              }),
              $(Fragment, {
                children:
                  media.width >= theme.fib[13] &&
                  count &&
                  $(FormBadge, {
                    label: `${count} Total`,
                  }),
              }),
              $(FormBadge, {
                label: 'Create Team',
                background: theme.bgAdmin,
                click: () => creatingSet(true),
              }),
            ]),
          }),
          $(Fragment, {
            children:
              teams === undefined
                ? $(Spinner)
                : $(Table, {
                    head: {
                      name: {label: 'Name', grow: 1},
                      createdOn: {label: 'Created', grow: 1},
                      updatedOn: {label: 'Updated', grow: 1},
                    },
                    body: teams.map((team) => ({
                      key: team.id,
                      click: () => currentIdSet(team.id),
                      data: {
                        name: {
                          value: team.name,
                          color: team.color,
                        },
                        createdOn: {
                          value: dayjs(team.createdOn).format('DD/MM/YYYY'),
                        },
                        updatedOn: {
                          value: dayjs(team.updatedOn).format('DD/MM/YYYY'),
                        },
                      },
                    })),
                  }),
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
          $(TeamViewAdmin, {
            team: current,
            teamSet: (i) => {
              if (i) teamsSet((x) => x?.map((z) => (z.id === i.id ? i : z)))
              else teamList()
            },
            close: () => currentIdSet(undefined),
          }),
      }),
    ]),
  })
}
/**
 *
 */
export const _DashboardTeamsCreate: FC<{
  teamSet: (team: TTeam) => void
  close: () => void
}> = ({teamSet, close}) => {
  const auth = useAuth()
  const $teamCreate = useEndpoint($TeamCreate)
  const form = useForm({
    name: '',
    color: SIMPLE_COLORS[0].string(),
    seasonId: auth.current?.season?.id!,
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
              $(FormLabel, {label: 'Color'}),
              $(InputSimpleColor, {
                value: form.data.color,
                valueSet: form.link('color'),
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
