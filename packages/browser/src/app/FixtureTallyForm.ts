import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TFixture} from '../schemas/ioFixture'
import {TTeam} from '../schemas/ioTeam'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {FormRow} from './Form/FormRow'
import {InputNumber} from './Input/InputNumber'
import {Modal} from './Modal'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
import {$ReportListOfFixture} from '../endpoints/Report'
import {TReport} from '../schemas/ioReport'
import {Table} from './Table'
import {FormBadge} from './Form/FormBadge'
import {hsla} from '../utils/hsla'
import {FormLabel} from './Form/FormLabel'
import {initials} from '../utils/initials'
/**
 *
 */
interface TFixtureForm {
  title: string
  date: string
  games: TFixture['games']
}
/**
 *
 */
export const FixtureTallyForm: FC<{
  fixture: TFixture
  loading?: boolean
  close: () => void
  done: (fixture: TFixtureForm) => void
}> = ({fixture, loading, close, done}) => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $reportList = useEndpoint($ReportListOfFixture)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [reports, reportsSet] = useState<TReport[]>()
  const form = useForm<TFixtureForm>(fixture)
  useEffect(() => {
    if (auth.current?.season)
      $teamList.fetch({seasonId: auth.current.season.id}).then((i) => {
        teamsSet(i.teams)
      })
  }, [])
  useEffect(() => {
    $reportList.fetch({roundId: fixture.id}).then(reportsSet)
  }, [fixture.id])
  return $(Modal, {
    width: theme.fib[14] + theme.fib[12] + theme.fib[6] * 2,
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: fixture.title,
          }),
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
          [theme.ltMedia(theme.fib[13])]: {
            flexDirection: 'column',
          },
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
                      const team1Bg = team1?.color
                        ? hsla.digest(team1?.color)
                        : undefined
                      const team2Bg = team2?.color
                        ? hsla.digest(team2?.color)
                        : undefined
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
                            $(FormLabel, {
                              grow: true,
                              label: team1?.name ?? '...',
                              background: team1Bg,
                              font: team1Bg?.compliment(),
                            }),
                            $(InputNumber, {
                              value: game.team1Score,
                              valueSet: (team1Score) => gamePatch({team1Score}),
                              placeholder: `Score...`,
                            }),
                            $(FormLabel, {
                              grow: true,
                              label: team2?.name ?? '...',
                              background: team2Bg,
                              font: team2Bg?.compliment(),
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
                flexGrow: 1,
                minWidth: theme.fib[12],
                borderLeft: theme.border(),
                background: theme.bgMinor.string(),
                padding: theme.fib[5],
                [theme.ltMedia(theme.fib[13])]: {
                  borderLeft: 'none',
                  borderTop: theme.border(),
                  minWidth: 0,
                },
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
                        return {
                          key: i.id,
                          data: {
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
                          },
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
