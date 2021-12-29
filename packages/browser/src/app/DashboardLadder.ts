import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$RoundListOfSeason, $RoundUpdate} from '../endpoints/Round'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TRound} from '../schemas/Round'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {fadein} from '../utils/keyframes'
import {tallyChart} from '../utils/tallyChart'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormSpinner} from './Form/FormSpinner'
import {Icon} from './Icon'
import {RoundTallyForm} from './RoundTallyForm'
import {Table} from './Table'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const DashboardLadder: FC = () => {
  const auth = useAuth()
  const $roundUpdate = useEndpoint($RoundUpdate)
  const $teamList = useEndpoint($TeamListOfSeason)
  const $roundList = useEndpoint($RoundListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>([])
  const [rounds, roundsSet] = useState<TRound[]>()
  const [editing, editingSet] = useState<TRound>()
  const [openrnds, openrndsSet] = useState<string[]>([])
  const tally = tallyChart(rounds ?? [])
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
          $(Table, {
            header: {
              name: {label: 'Name', grow: 4},
              points: {label: 'Points', grow: 1},
              wins: {label: 'Wins', grow: 1},
              loses: {label: 'Loses', grow: 1},
              draws: {label: 'Draws', grow: 1},
              for: {label: 'For', grow: 1},
              against: {label: 'Against', grow: 1},
            },
            body: teams
              .sort((a, b) => {
                const pa = tally[a.id]?.points ?? 0
                const pb = tally[b.id]?.points ?? 0
                if (pa === pb) {
                  const fa = tally[a.id]?.for ?? 0
                  const fb = tally[b.id]?.for ?? 0
                  return fa === fb ? 0 : fa < fb ? 1 : -1
                }
                return pa < pb ? 1 : -1
              })
              .map((i) => {
                const results = tally[i.id]
                return {
                  id: {value: i.id},
                  name: {value: i.name, color: i.color},
                  points: {value: results?.points},
                  wins: {value: results?.wins},
                  loses: {value: results?.loses},
                  draws: {value: results?.draws},
                  for: {value: results?.for},
                  against: {value: results?.against},
                }
              }),
          }),
          $(Fragment, {
            children:
              !!rounds?.length &&
              $(Fragment, {
                children:
                  teams === undefined
                    ? $(FormSpinner)
                    : $('div', {
                        className: css({
                          border: theme.border,
                          '& > *:not(:last-child)': {
                            borderBottom: theme.border,
                          },
                        }),
                        children: rounds.map((round) => {
                          return $(_LadderRound, {
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
                        }),
                      }),
              }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          editing &&
          $(RoundTallyForm, {
            round: editing,
            loading: $roundUpdate.loading,
            close: () => editingSet(undefined),
            done: (data) =>
              $roundUpdate
                .fetch({
                  ...data,
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
const _LadderRound: FC<{
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
                team1: {label: 'Team 1', grow: 2},
                team1Score: {label: 'Team 1 Score', grow: 1},
                team2: {label: 'Team 2', grow: 2},
                team2Score: {label: 'Team 2 Score', grow: 1},
              },
              body: round.games.map((game) => {
                const team1 = teams.find((i) => i.id === game.team1Id)
                const team2 = teams.find((i) => i.id === game.team2Id)
                return {
                  id: {value: game.id},
                  team1: {value: team1?.name, color: team1?.color},
                  team1Score: {value: game.team1Score},
                  team2: {value: team2?.name, color: team2?.color},
                  team2Score: {value: game.team2Score},
                }
              }),
            }),
            isAdmin &&
              $(FormButton, {
                label: 'Edit Round Results',
                color: hsla.digest(theme.bgAdminColor),
                click: () => editingSet(round),
              }),
          ]),
        }),
    ]),
  })
}
