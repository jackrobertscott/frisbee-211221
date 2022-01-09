import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TTeam} from '../schemas/ioTeam'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {go} from '../utils/go'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {Modal} from './Modal'
import {Spinner} from './Spinner'
import {Table} from './Table'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const DashboardTeams: FC = () => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const seasonId = auth.current?.season?.id
  const [teams, teamsSet] = useState<TTeam[]>()
  const [current, currentSet] = useState<TTeam>()
  useEffect(() => {
    if (!auth.isAdmin()) go.to('/')
    if (seasonId) $teamList.fetch({seasonId: seasonId}).then(teamsSet)
  }, [seasonId, auth.current])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
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
                  click: () => currentSet(team),
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
            close: () => currentSet(undefined),
          }),
      }),
    ]),
  })
}
/**
 *
 */
export const DashboardTeamsView: FC<{team: TTeam; close: () => void}> = ({
  team,
  close,
}) => {
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        title: team.name,
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
              $(FormLabel, {
                label: team.name,
                grow: true,
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Created'}),
              $(FormLabel, {
                label: dayjs(team.createdOn).format(theme.dateFormat),
                grow: true,
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {label: 'Last Updated'}),
              $(FormLabel, {
                label: dayjs(team.updatedOn).format(theme.dateFormat),
                grow: true,
              }),
            ]),
          }),
        ]),
      }),
    ]),
  })
}
