import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TRound} from '../schemas/ioFixture'
import {TTeam} from '../schemas/ioTeam'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {FormRow} from './Form/FormRow'
import {InputNumber} from './Input/InputNumber'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
import {$ReportListOfRound} from '../endpoints/Report'
import {TReport} from '../schemas/ioReport'
import {Table} from './Table'
import {FormBadge} from './Form/FormBadge'
import {hsla} from '../utils/hsla'
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
  fixture: TRound
  loading?: boolean
  close: () => void
  done: (fixture: TRoundForm) => void
}> = ({fixture, loading, close, done}) => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfRound)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [reports, reportsSet] = useState<TReport[]>()
  const form = useForm<TRoundForm>(fixture)
  useEffect(() => {
    if (auth.current?.season)
      $teamList.fetch({seasonId: auth.current.season.id}).then((_teams) => {
        teamsSet(_teams)
      })
  }, [])
  useEffect(() => {
    $reportList.fetch({roundId: fixture.id}).then(reportsSet)
  }, [fixture.id])
  return $(Modal, {
    width: 987 + 13 * 2,
    children: addkeys([
      $(TopBar, {
        title: fixture.title,
        children: addkeys([
          $(TopBarBadge, {
            label: dayjs(fixture.date).format('D MMM YYYY'),
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
            background: theme.bgMinor,
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
                            $(FormBadge, {
                              label: team1?.name ?? '...',
                              background: team1?.color
                                ? hsla.digest(team1?.color)
                                : undefined,
                            }),
                            $(InputNumber, {
                              value: game.team1Score,
                              valueSet: (team1Score) => gamePatch({team1Score}),
                              placeholder: `Score...`,
                            }),
                            $(FormBadge, {
                              label: team2?.name ?? '...',
                              background: team2?.color
                                ? hsla.digest(team2?.color)
                                : undefined,
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
                children: $(FormBadge, {
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
                borderLeft: theme.border(),
                background: theme.bgMinor.string(),
                padding: theme.fib[5],
              }),
              children: addkeys([
                $('div', {
                  children: 'Reports',
                  className: css({
                    margin: `-${theme.fontInset}px 0 ${
                      theme.fib[5] - theme.fontInset
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
                  : $(FormBadge, {
                      label: 'Empty',
                      background: theme.bg,
                      font: theme.fontMinor,
                    }),
              ]),
            }),
        ]),
      }),
    ]),
  })
}
