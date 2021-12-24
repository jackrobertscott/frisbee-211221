import {createElement as $, FC, useEffect, useState} from 'react'
import {$TeamList} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormList} from './Form/FormList'
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
    children: addkeys([
      $('div', {children: 'Ladder'}),
      $(FormList, {
        list: teams.map((i) => ({...i, label: i.name})),
      }),
    ]),
  })
}
