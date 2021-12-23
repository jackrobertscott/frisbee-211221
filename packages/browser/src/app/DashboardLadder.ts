import {createElement as $, FC, useEffect, useState} from 'react'
import {$TeamList} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormList} from './Form/FormList'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const DashboardLadder: FC = () => {
  const [teams, teamsSet] = useState<TTeam[]>([])
  const $teamList = useEndpoint($TeamList)
  useEffect(() => {
    $teamList.fetch({}).then(teamsSet)
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
