import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TRound} from '../schemas/Round'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormColumn} from './Form/FormColumn'
import {FormRow} from './Form/FormRow'
import {FormStatic} from './Form/FormStatic'
import {InputNumber} from './Input/InputNumber'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
import {$ReportListOfRound} from '../endpoints/Report'
import {TReport} from '../schemas/Report'
import {Table} from './Table'
/**
 *
 */
interface TRoundForm {
  title: string
  date: string
  games: TRound['games']
}
/**
 *
 */
export const RoundTallyForm: FC<{
  round: TRound
  loading?: boolean
  close: () => void
  done: (round: TRoundForm) => void
}> = ({round, loading, close, done}) => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfRound)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [reports, reportsSet] = useState<TReport[]>()
  const form = useForm<TRoundForm>(round)
  useEffect(() => {
    if (auth.current?.season)
      $teamList.fetch({seasonId: auth.current.season.id}).then((_teams) => {
        teamsSet(_teams)
      })
  }, [])
  useEffect(() => {
    $reportList.fetch({roundId: round.id}).then(reportsSet)
  }, [round.id])
  return $(Modal, {
    width: 987 + 13 * 2,
    children: addkeys([
      $(TopBar, {
        title: round.title,
        children: addkeys([
          $(TopBarBadge, {
            label: dayjs(round.date).format('D MMM YYYY'),
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $('div', {
        className: css({
          display: 'flex',
        }),
        children: addkeys([
          $(Form, {
            background: theme.bgMinorColor,
            children: addkeys([
              $(Fragment, {
                children:
                  !!teams?.length &&
                  $(FormColumn, {
                    children: form.data.games.map((game) => {
                      const team1 = teams.find((i) => i.id === game.team1Id)
                      const team2 = teams.find((i) => i.id === game.team2Id)
                      const gamePatch = (data: Partial<typeof game>) =>
                        form.patch({
                          games: form.data.games.map((i) => {
                            return i.id === game.id ? {...game, ...data} : i
                          }),
                        })
                      return $(FormRow, {
                        key: game.id,
                        children: addkeys(
                          [
                            $(FormStatic, {
                              label: team1?.name ?? '...',
                              background: team1?.color,
                            }),
                            $(InputNumber, {
                              value: game.team1Score,
                              valueSet: (team1Score) => gamePatch({team1Score}),
                              placeholder: `Score...`,
                            }),
                            $(FormStatic, {
                              label: team2?.name ?? '...',
                              background: team2?.color,
                            }),
                            $(InputNumber, {
                              value: game.team2Score,
                              valueSet: (team2Score) => gamePatch({team2Score}),
                              placeholder: `Score...`,
                            }),
                          ].map((child) => {
                            return $('div', {
                              children: child,
                              className: css({
                                display: 'flex',
                                flexGrow: 1,
                                flexShrink: 1,
                                flexBasis: 0,
                                overflow: 'hidden',
                              }),
                            })
                          })
                        ),
                      })
                    }),
                  }),
              }),
              $('div', {
                children: $(FormButton, {
                  disabled: loading,
                  label: loading ? 'Loading' : 'Submit',
                  click: () => done(form.data),
                }),
              }),
            ]),
          }),
          reports &&
            $('div', {
              className: css({
                width: 377,
                borderLeft: theme.border,
                padding: theme.formPadding,
                background: theme.bgMinorColor,
              }),
              children: addkeys([
                $('div', {
                  children: 'Reports',
                  className: css({
                    margin: `-${theme.fontInset}px 0 ${
                      theme.formPadding - theme.fontInset
                    }px`,
                  }),
                }),
                reports.length && teams?.length
                  ? $(Table, {
                      head: {
                        team1: {label: 'Team 1', grow: 1},
                        team1Score: {label: 'Score', grow: 1},
                        team2: {label: 'Team 2', grow: 1},
                        team2Score: {label: 'Score', grow: 1},
                      },
                      body: reports.map((i) => {
                        const team1 = teams.find((x) => x.id === i.teamId)
                        const team2 = teams.find((x) => {
                          return x.id === i.teamAgainstId
                        })
                        const initials = (data?: string) =>
                          data
                            ?.split(' ')
                            .map((i) => i.charAt(0))
                            .join('')
                        return {
                          id: {value: i.id},
                          team1: {
                            value: initials(team1?.name),
                            color: team1?.color,
                          },
                          team1Score: {value: i.scoreFor},
                          team2: {
                            value: initials(team2?.name),
                            color: team2?.color,
                          },
                          team2Score: {value: i.scoreAgainst},
                        }
                      }),
                    })
                  : $(FormStatic, {
                      label: 'Empty',
                      color: theme.minorColor,
                      background: theme.bgColor,
                    }),
              ]),
            }),
        ]),
      }),
    ]),
  })
}
