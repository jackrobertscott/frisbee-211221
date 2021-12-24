import dayjs from 'dayjs'
import {createElement as $, FC, useEffect, useState} from 'react'
import {$TeamList} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {Table} from './Table'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const DashboardLadder: FC = () => {
  const auth = useAuth()
  const [teams, teamsSet] = useState<TTeam[]>([])
  const $teamList = useEndpoint($TeamList)
  useEffect(() => {
    if (auth.current?.season)
      $teamList.fetch({seasonId: auth.current.season.id}).then(teamsSet)
  }, [])
  return $(Form, {
    background: theme.bgMinorColor,
    children: addkeys([
      $(Table, {
        header: {
          name: {label: 'Name', grow: 2},
          wins: {label: 'Wins', grow: 1},
          loses: {label: 'Loses', grow: 1},
          draws: {label: 'Draws', grow: 1},
        },
        body: teams.map((i) => ({
          id: i.id,
          name: i.name,
          createdOn: dayjs(i.createdOn).format('DD/MM/YYYY'),
        })),
      }),
    ]),
  })
}
