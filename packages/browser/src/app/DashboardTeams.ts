import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamListOfSeason, $TeamUpdate} from '../endpoints/Team'
import {TTeam} from '../schemas/ioTeam'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {go} from '../utils/go'
import {objectify} from '../utils/objectify'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputSimpleColor} from './Input/InputSimpleColor'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {Spinner} from './Spinner'
import {Table} from './Table'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const DashboardTeams: FC = () => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const seasonId = auth.current?.season?.id
  const [teams, teamsSet] = useState<TTeam[]>()
  const [currentId, currentIdSet] = useState<string>()
  const current = currentId && teams?.find((i) => i.id === currentId)
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    if (seasonId) $teamList.fetch({seasonId: seasonId}).then(teamsSet)
  }, [seasonId, auth.current])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin.lighten(5),
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
      $(Fragment, {
        children:
          current &&
          $(DashboardTeamsView, {
            team: current,
            teamSet: (i) =>
              teamsSet((x) => x?.map((z) => (z.id === i.id ? i : z))),
            close: () => currentIdSet(undefined),
          }),
      }),
    ]),
  })
}
/**
 *
 */
export const DashboardTeamsView: FC<{
  team: TTeam
  teamSet: (team: TTeam) => void
  close: () => void
}> = ({team, teamSet, close}) => {
  const $teamUpdate = useEndpoint($TeamUpdate)
  const form = useForm({
    ...team,
  })
  const isDifferent = !objectify.compareKeys(team, form.data, ['name', 'color'])
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        title: 'Team',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
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
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Created'}),
              $(FormLabel, {
                label: dayjs(team.createdOn).format(theme.dateFormat),
                background: theme.bgDisabled,
                grow: true,
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Last Updated'}),
              $(FormLabel, {
                label: dayjs(team.updatedOn).format(theme.dateFormat),
                background: theme.bgDisabled,
                grow: true,
              }),
            ]),
          }),
          isDifferent &&
            $(FormBadge, {
              disabled: $teamUpdate.loading,
              label: $teamUpdate.loading ? 'Loading' : 'Save Changes',
              click: () =>
                $teamUpdate
                  .fetch({...form.data, teamId: team.id})
                  .then(teamSet),
            }),
        ]),
      }),
    ]),
  })
}
