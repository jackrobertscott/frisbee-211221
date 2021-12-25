import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, useState} from 'react'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {Table} from './Table'
/**
 *
 */
export const DashboardSchedule: FC = () => {
  const auth = useAuth()
  const [teams] = useState<TTeam[]>(() => {
    return teamGenerator(auth.current?.season?.id!)
  })
  return $(Form, {
    children: addkeys([
      auth.isAdmin() &&
        $(FormButton, {
          label: 'Add Round',
          color: hsla.digest(theme.bgAdminColor),
        }),
      $(_ScheduleRound, {
        title: 'Game 3',
        teams,
      }),
      $(_ScheduleRound, {
        title: 'Game 2',
        teams,
      }),
      $(_ScheduleRound, {
        title: 'Game 1',
        teams,
      }),
    ]),
  })
}
/**
 *
 */
const _ScheduleRound: FC<{
  title: string
  teams: TTeam[]
}> = ({title, teams}) => {
  return $('div', {
    children: addkeys([
      $('div', {
        className: css({
          marginTop: -theme.fontInset,
        }),
        children: addkeys([
          $('div', {
            children: title,
            className: css({
              fontSize: 21,
              marginBottom: 5 - theme.fontInset,
            }),
          }),
          $('div', {
            children: dayjs().format('DD/MM/YYYY'),
            className: css({
              marginBottom: 13 - theme.fontInset,
              color: theme.minorColor,
            }),
          }),
        ]),
      }),
      $(Table, {
        header: {
          one: {label: 'Team 1', grow: 2},
          two: {label: 'Team 2', grow: 2},
          time: {label: 'Time', grow: 1},
          field: {label: 'Field', grow: 1},
        },
        body: new Array(6).fill(0).map((_, index) => {
          const one = teams[Math.floor(Math.random() * teams.length)]
          const two = teams[Math.floor(Math.random() * teams.length)]
          return {
            id: {value: index.toString()},
            one: {value: one.name, color: one.color},
            two: {value: two.name, color: two.color},
            time: {value: index < 3 ? '6:45' : '7:45'},
            field: {value: `Field ${(index % 3) + 1}`},
          }
        }),
      }),
    ]),
  })
}
/**
 *
 */
const teamGenerator = (seasonId: string): TTeam[] => {
  return [
    {seasonId, name: 'Pistol Shrimp', color: hsla.string(0, 0, 100)},
    {seasonId, name: 'Marlow Street', color: hsla.string(0, 100, 65)},
    {
      seasonId,
      name: 'Disc It For The Biscuit',
      color: hsla.string(210, 100, 70),
    },
  ].map((i, index) => ({
    ...i,
    id: index.toString(),
    createdOn: new Date().toISOString(),
    updatedOn: new Date().toISOString(),
  }))
}
