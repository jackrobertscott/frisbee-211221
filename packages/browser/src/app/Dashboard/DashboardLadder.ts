import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FixtureListOfSeason, $FixtureUpdate} from '../../endpoints/Fixture'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {TFixture} from '../../schemas/ioFixture'
import {TTeam} from '../../schemas/ioTeam'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {initials} from '../../utils/initials'
import {TTallyChart, tallyChart} from '../../utils/tallyChart'
import {useAuth} from '../Auth/useAuth'
import {FixtureTallyForm} from '../FixtureTallyForm'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {Graph} from '../Graph'
import {Icon} from '../Icon'
import {useMedia} from '../Media/useMedia'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useEndpoint} from '../useEndpoint'
/**
 *
 */
export const DashboardLadder: FC = () => {
  const auth = useAuth()
  const media = useMedia()
  const $fixtureUpdate = useEndpoint($FixtureUpdate)
  const $teamList = useEndpoint($TeamListOfSeason)
  const $fixtureList = useEndpoint($FixtureListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>([])
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [editing, editingSet] = useState<TFixture>()
  const [openrnds, openrndsSet] = useState<string[]>([])
  const tally = tallyChart(fixtures ?? [])
  const reload = () => {
    const seasonId = auth.season!.id
    $teamList.fetch({seasonId}).then((i) => teamsSet(i.teams))
    $fixtureList.fetch({seasonId}).then(fixturesSet)
  }
  useEffect(() => reload(), [])
  const teamsUndivided = teams.filter((i) => typeof i.division !== 'number')
  const divisions = teams
    .reduce((all, next) => {
      if (!next.division) return all
      if (!all.includes(next.division)) all.push(next.division)
      return all
    }, [] as number[])
    .sort((a, b) => a - b)
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(Fragment, {
            children: divisions.map((division) => {
              return $(_LadderDivision, {
                key: division.toString(),
                label: `Division ${division}`,
                teams: teams.filter((i) => i.division === division),
                tally,
              })
            }),
          }),
          $(Fragment, {
            children:
              !!teamsUndivided.length &&
              $(_LadderDivision, {
                teams: teamsUndivided,
                tally,
              }),
          }),
          $(Fragment, {
            children:
              !!fixtures?.length &&
              $(Fragment, {
                children:
                  teams === undefined
                    ? $(Spinner)
                    : $('div', {
                        className: css({
                          '& > *:not(:last-child)': {
                            marginBottom: theme.fib[5],
                          },
                        }),
                        children: fixtures.map((fixture) => {
                          return $(_LadderFixture, {
                            key: fixture.id,
                            fixture,
                            teams,
                            isAdmin: auth.isAdmin(),
                            open: openrnds.includes(fixture.id),
                            editingSet,
                            toggle: () =>
                              openrndsSet((i) => {
                                return i.includes(fixture.id)
                                  ? i.filter((x) => x !== fixture.id)
                                  : i.concat(fixture.id)
                              }),
                          })
                        }),
                      }),
              }),
          }),
          $(Fragment, {
            children:
              fixtures !== undefined &&
              $(Graph, {
                height:
                  media.width > theme.fib[13] ? theme.fib[12] : theme.fib[11],
                title: 'All Teams, All Games',
                yLabel: 'Occurrences',
                xLabel: 'Points Scored',
                bars: (() => {
                  const all = fixtures
                    .map((i) => {
                      return i.games
                        .map((x) => [x.team1Score, x.team2Score])
                        .flat()
                    })
                    .flat()
                    .filter((i) => typeof i === 'number') as number[]
                  const max = Math.max(0, ...all)
                  const data = new Array<number>(max + 1).fill(0)
                  for (let i = 0; i < data.length; i++)
                    data[i] = all.filter((x) => x === i).length
                  return data
                })(),
              }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          editing &&
          $(FixtureTallyForm, {
            fixture: editing,
            loading: $fixtureUpdate.loading,
            close: () => editingSet(undefined),
            done: (data) =>
              $fixtureUpdate
                .fetch({
                  ...data,
                  fixtureId: editing.id,
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
const _LadderFixture: FC<{
  fixture: TFixture
  teams: TTeam[]
  open: boolean
  isAdmin: boolean
  toggle: () => void
  editingSet: (fixture: TFixture) => void
}> = ({fixture, teams, open, isAdmin, toggle, editingSet}) => {
  const media = useMedia()
  const isSmall = media.width < theme.fib[13]
  return $(FormColumn, {
    children: addkeys([
      $('div', {
        onClick: () => toggle(),
        className: css({
          display: 'flex',
          justifyContent: 'space-between',
          userSelect: 'none',
          border: theme.border(),
          background: theme.bgMinor.string(),
          padding: theme.padify(theme.fib[4]),
          '&:hover': {
            background: theme.bgMinor.hover(),
          },
          '&:active': {
            background: theme.bgMinor.press(),
          },
        }),
        children: addkeys([
          $('div', {
            children: fixture.title,
          }),
          $('div', {
            className: css({
              display: 'flex',
              color: theme.fontMinor.string(),
              '& > *:not(:last-child)': {
                marginRight: theme.fib[4],
              },
            }),
            children: addkeys([
              $('div', {
                children: dayjs(fixture.date).format('D MMM YYYY'),
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
        $(FormColumn, {
          children: addkeys([
            $(Table, {
              head: {
                team1: {label: 'Team 1', grow: isSmall ? 1 : 2},
                team1Score: {label: 'Score', grow: isSmall ? 1 : 1},
                team2: {label: 'Team 2', grow: isSmall ? 1 : 2},
                team2Score: {label: 'Score', grow: isSmall ? 1 : 1},
              },
              body: fixture.games.map((game) => {
                const team1 = teams.find((i) => i.id === game.team1Id)
                const team2 = teams.find((i) => i.id === game.team2Id)
                return {
                  key: game.id,
                  data: {
                    team1: {
                      value: isSmall
                        ? initials(team1?.name)
                        : team1?.name ?? '[unknown]',
                      color: team1?.color,
                    },
                    team1Score: {value: game.team1Score},
                    team2: {
                      value: isSmall
                        ? initials(team2?.name)
                        : team2?.name ?? '[unknown]',
                      color: team2?.color,
                    },
                    team2Score: {value: game.team2Score},
                  },
                }
              }),
            }),
            isAdmin &&
              $(FormBadge, {
                label: 'Edit Fixture Results',
                background: theme.bgAdmin,
                click: () => editingSet(fixture),
              }),
          ]),
        }),
    ]),
  })
}
/**
 *
 */
const _LadderDivision: FC<{
  teams: TTeam[]
  tally: Record<string, TTallyChart | undefined>
  label?: string
}> = ({teams, tally, label}) => {
  return $(FormColumn, {
    children: addkeys([
      $(Fragment, {
        children:
          label &&
          $(FormLabel, {
            label,
            background: theme.bgMinor,
          }),
      }),
      $(Table, {
        head: {
          name: {label: 'Name', grow: 4},
          games: {label: 'Games', grow: 1.35},
          points: {label: 'Points', grow: 1.2},
          wins: {label: 'Wins', grow: 1.05},
          loses: {label: 'Loses', grow: 1.15},
          draws: {label: 'Draws', grow: 1.2},
          ratio: {label: 'Ratio', grow: 1.05},
          for: {label: 'For', grow: 1},
          against: {label: 'Agnst', grow: 1.15},
          aveFor: {label: 'Av.For', grow: 1.2},
          aveAgainst: {label: 'Av.Agt', grow: 1.25},
        },
        body: teams
          .sort((a, b) => {
            const pa = tally[a.id]?.points ?? 0
            const pb = tally[b.id]?.points ?? 0
            if (pa === pb) {
              const fa = tally[a.id]?.ratio ?? 0
              const fb = tally[b.id]?.ratio ?? 0
              return fa === fb ? 0 : fa < fb ? 1 : -1
            }
            return pa < pb ? 1 : -1
          })
          .map((i) => {
            const results = tally[i.id]
            return {
              key: i.id,
              data: {
                name: {value: i.name, color: i.color},
                games: {value: results?.games},
                points: {value: results?.points},
                wins: {value: results?.wins},
                loses: {value: results?.loses},
                draws: {value: results?.draws},
                ratio: {value: results?.ratio},
                for: {value: results?.for},
                against: {value: results?.against},
                aveFor: {value: results?.aveFor},
                aveAgainst: {value: results?.aveAgainst},
              },
            }
          }),
      }),
    ]),
  })
}
