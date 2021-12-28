import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, useState} from 'react'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {fadein} from '../utils/keyframes'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {Icon} from './Icon'
import {Table} from './Table'
import {useLocalState} from './useLocalState'
/**
 *
 */
export const DashboardSchedule: FC = () => {
  const auth = useAuth()
  const [openrnds, openrndsSet] = useLocalState<string[]>('frisbee.rounds', [])
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
      $('div', {
        className: css({
          border: theme.border,
          '& > *:not(:last-child)': {
            borderBottom: theme.border,
          },
        }),
        children: ['Game 1', 'Game 2', 'Game 3'].reverse().map((round) => {
          return $(_ScheduleRound, {
            key: round,
            title: round,
            teams,
            open: openrnds.includes(round),
            toggle: () =>
              openrndsSet((i) => {
                return i.includes(round)
                  ? i.filter((x) => x !== round)
                  : i.concat(round)
              }),
          })
        }),
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
  open: boolean
  toggle: () => void
}> = ({title, teams, open, toggle}) => {
  const bghsla = hsla.digest(theme.bgMinorColor)
  return $('div', {
    children: addkeys([
      $('div', {
        onClick: () => toggle(),
        className: css({
          display: 'flex',
          justifyContent: 'space-between',
          userSelect: 'none',
          color: theme.minorColor,
          background: hsla.render(bghsla),
          padding: theme.padify(theme.formPadding),
          '&:hover': {
            background: hsla.render(hsla.darken(5, bghsla)),
          },
          '&:active': {
            background: hsla.render(hsla.darken(10, bghsla)),
          },
        }),
        children: addkeys([
          $('div', {
            children: `${dayjs().format('D MMMM')}: ${title}`,
          }),
          $('div', {
            children: $(Icon, {
              icon: open ? 'angle-double-up' : 'angle-double-down',
              multiple: 1,
            }),
          }),
        ]),
      }),
      open &&
        $('div', {
          className: css({
            padding: theme.formPadding,
            borderTop: theme.border,
            animation: `150ms linear ${fadein}`,
          }),
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
                  children: dayjs().format('D MMMM YYYY'),
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
