import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $RoundCreate,
  $RoundListOfSeason,
  $RoundUpdate,
} from '../endpoints/Round'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TRound} from '../schemas/Round'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {fadein} from '../utils/keyframes'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormSpinner} from './Form/FormSpinner'
import {Icon} from './Icon'
import {RoundSetupForm} from './RoundSetupForm'
import {Table} from './Table'
import {useEndpoint} from './useEndpoint'
import {useLocalState} from './useLocalState'
/**
 *
 */
export const DashboardSchedule: FC = () => {
  const auth = useAuth()
  const $roundCreate = useEndpoint($RoundCreate)
  const $roundUpdate = useEndpoint($RoundUpdate)
  const $teamList = useEndpoint($TeamListOfSeason)
  const $roundList = useEndpoint($RoundListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [rounds, roundsSet] = useState<TRound[]>()
  const [creating, creatingSet] = useState(false)
  const [editing, editingSet] = useState<TRound>()
  const [openrnds, openrndsSet] = useLocalState<string[]>('frisbee.rounds', [])
  const reload = () => {
    if (!auth.current?.season) return
    const seasonId = auth.current.season.id
    $teamList.fetch({seasonId}).then(teamsSet)
    $roundList.fetch({seasonId}).then(roundsSet)
  }
  useEffect(() => reload(), [])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        children: addkeys([
          auth.isAdmin() &&
            $(FormButton, {
              label: 'Add Round',
              color: hsla.digest(theme.bgAdminColor),
              click: () => creatingSet(true),
            }),
          rounds === undefined || teams === undefined
            ? $(FormSpinner)
            : $('div', {
                className: css({
                  border: theme.border,
                  '& > *:not(:last-child)': {
                    borderBottom: theme.border,
                  },
                }),
                children: rounds.length
                  ? rounds.map((round) => {
                      return $(_ScheduleRound, {
                        key: round.id,
                        round,
                        teams,
                        isAdmin: auth.isAdmin(),
                        open: openrnds.includes(round.id),
                        editingSet,
                        toggle: () =>
                          openrndsSet((i) => {
                            return i.includes(round.id)
                              ? i.filter((x) => x !== round.id)
                              : i.concat(round.id)
                          }),
                      })
                    })
                  : $('div', {
                      children: 'No Rounds Yet',
                      className: css({
                        color: theme.minorColor,
                        padding: theme.padify(theme.inputPadding),
                        textAlign: 'center',
                      }),
                    }),
              }),
        ]),
      }),
      $(Fragment, {
        children:
          creating &&
          $(RoundSetupForm, {
            loading: $roundCreate.loading,
            close: () => creatingSet(false),
            done: (data) =>
              auth.current?.season &&
              $roundCreate
                .fetch({
                  ...data,
                  date: data.date!,
                  games: data.games as TRound['games'],
                  seasonId: auth.current.season.id,
                })
                .then(() => {
                  reload()
                  creatingSet(false)
                }),
          }),
      }),
      $(Fragment, {
        children:
          editing &&
          $(RoundSetupForm, {
            round: editing,
            loading: $roundUpdate.loading,
            close: () => editingSet(undefined),
            done: (data) =>
              $roundUpdate
                .fetch({
                  ...data,
                  date: data.date!,
                  games: data.games as TRound['games'],
                  roundId: editing.id,
                })
                .then(() => {
                  reload()
                  editingSet(undefined)
                }),
          }),
      }),
    ]),
  })
}
/**
 *
 */
const _ScheduleRound: FC<{
  round: TRound
  teams: TTeam[]
  open: boolean
  isAdmin: boolean
  toggle: () => void
  editingSet: (round: TRound) => void
}> = ({round, teams, open, isAdmin, toggle, editingSet}) => {
  const bghsla = hsla.digest(theme.bgMinorColor)
  return $('div', {
    children: addkeys([
      $('div', {
        onClick: () => toggle(),
        className: css({
          display: 'flex',
          justifyContent: 'space-between',
          userSelect: 'none',
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
            children: round.title,
          }),
          $('div', {
            className: css({
              display: 'flex',
              color: theme.minorColor,
              '& > *:not(:last-child)': {
                marginRight: theme.inputPadding,
              },
            }),
            children: addkeys([
              $('div', {
                children: dayjs(round.date).format('D MMM YYYY'),
              }),
              $(Icon, {
                icon: open ? 'angle-up' : 'angle-down',
                multiple: 1,
              }),
            ]),
          }),
        ]),
      }),
      open &&
        $('div', {
          className: css({
            borderTop: theme.border,
            padding: theme.formPadding,
            animation: `150ms linear ${fadein}`,
            '& > *:not(:last-child)': {
              marginBottom: theme.formPadding,
            },
          }),
          children: addkeys([
            $(Table, {
              header: {
                one: {label: 'Team 1', grow: 2},
                two: {label: 'Team 2', grow: 2},
                time: {label: 'Time', grow: 1},
                place: {label: 'Place', grow: 1},
              },
              body: round.games.map((game) => {
                const team1 = teams.find((i) => i.id === game.team1Id)
                const team2 = teams.find((i) => i.id === game.team2Id)
                return {
                  id: {value: game.id},
                  one: {value: team1?.name, color: team1?.color},
                  two: {value: team2?.name, color: team2?.color},
                  time: {value: game.time},
                  place: {value: game.place},
                }
              }),
            }),
            isAdmin &&
              $(FormButton, {
                label: 'Edit Round',
                color: hsla.digest(theme.bgAdminColor),
                click: () => editingSet(round),
              }),
          ]),
        }),
    ]),
  })
}
