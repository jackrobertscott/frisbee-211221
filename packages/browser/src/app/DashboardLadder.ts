import {createElement as $, FC, useEffect, useState} from 'react'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {Table} from './Table'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const DashboardLadder: FC = () => {
  const auth = useAuth()
  const [teams, teamsSet] = useState<TTeam[]>([])
  const $teamList = useEndpoint($TeamListOfSeason)
  useEffect(() => {
    if (auth.current?.season)
      $teamList.fetch({seasonId: auth.current.season.id}).then(teamsSet)
  }, [])
  return $(Form, {
    children: addkeys([
      auth.isAdmin() &&
        $(FormButton, {
          label: 'Manage Game Results',
          color: hsla.digest(theme.bgAdminColor),
        }),
      $(Table, {
        header: {
          name: {label: 'Name', grow: 2},
          wins: {label: 'Wins', grow: 1},
          loses: {label: 'Loses', grow: 1},
          draws: {label: 'Draws', grow: 1},
        },
        body: teams.map((i) => ({
          id: {value: i.id},
          name: {value: i.name, color: i.color},
        })),
      }),
    ]),
  })
}
