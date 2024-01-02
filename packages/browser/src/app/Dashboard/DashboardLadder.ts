import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FixtureListOfSeason, $FixtureUpdate} from '../../endpoints/Fixture'
import {$SeasonUpdate} from '../../endpoints/Season'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {TFixture} from '../../schemas/ioFixture'
import {TSeason} from '../../schemas/ioSeason'
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
import {FormRow} from '../Form/FormRow'
import {Graph} from '../Graph'
import {Icon} from '../Icon'
import {InputNumber} from '../Input/InputNumber'
import {useMedia} from '../Media/useMedia'
import {Modal} from '../Modal'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {TopBar, TopBarBadge} from '../TopBar'
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
  const [addingFinal, addingFinalSet] = useState(false)
  const tally = tallyChart(fixtures ?? [])
  const reload = () => {
    const seasonId = auth.season!.id
    $teamList.fetch({seasonId}).then((i) => teamsSet(i.teams))
    $fixtureList.fetch({seasonId}).then(fixturesSet)
  }
  useEffect(() => reload(), [])
  const finalResultsAndTeam = auth.season?.finalResults
    ?.filter((i) => i.position !== undefined)
    .map((i) => [i, teams.find((t) => t.id === i.teamId)] as const)
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
            children:
              auth.isAdmin() &&
              $(FormBadge, {
                grow: true,
                label: 'Edit Final Results',
                background: theme.bgAdmin,
                click: () => addingFinalSet(true),
              }),
          }),
          $(Fragment, {
            children:
              !!finalResultsAndTeam?.length &&
              divisions.map((division) => {
                const resultsOfDiv = finalResultsAndTeam
                  .filter(([i]) => i.position !== undefined)
                  .filter(([_, t]) => t?.division === division)
                  .sort((a, b) => a[0].position! - b[0].position!)
                if (resultsOfDiv.length === 0) return null
                return $(FormColumn, {
                  key: division.toString(),
                  children: addkeys([
                    $(FormBadge, {
                      label: 'Final Results of Div ' + division,
                      background: theme.bgMinor,
                    }),
                    $(Table, {
                      head: {
                        position: {label: 'Position', grow: 1},
                        team: {label: 'Team', grow: 3},
                      },
                      body: resultsOfDiv.map(([fr, t]) => {
                        return {
                          key: fr.teamId,
                          data: {
                            position: {value: fr.position!},
                            team: {
                              icon: fr.position === 1 ? 'trophy' : undefined,
                              value: t?.name ?? 'Unknown',
                              color: t?.color,
                            },
                          },
                        }
                      }),
                    }),
                  ]),
                })
              }),
          }),
          $(Fragment, {
            children: divisions.map((division) => {
              return $(_LadderDivision, {
                key: division.toString(),
                label: `Div ${division}`,
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
          auth.season &&
          addingFinal &&
          $(FinalResultsForm, {
            teams,
            divisions,
            season: auth.season,
            close: () => addingFinalSet(false),
            done: (season) => {
              auth.seasonSet(season)
              addingFinalSet(false)
            },
          }),
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
            icon: 'flag',
            background: theme.bgMinor,
          }),
      }),
      $(Table, {
        head: {
          name: {label: 'Name', grow: 5},
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
/**
 *
 */
export const FinalResultsForm: FC<{
  teams: TTeam[]
  divisions: number[]
  season: TSeason
  close: () => void
  done: (season: TSeason) => void
}> = ({teams, divisions, season, close, done}) => {
  const $updateSeason = useEndpoint($SeasonUpdate)
  const [finalResults, setFinalResults] = useState<
    NonNullable<TSeason['finalResults']>
  >(season.finalResults ?? [])
  return $(Modal, {
    width: theme.fib[12],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Add Final Results',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(Fragment, {
            children: divisions.map((division) => {
              const teamsOfDiv = teams.filter((i) => i.division === division)
              return $(FormColumn, {
                key: division.toString(),
                children: addkeys([
                  $(FormLabel, {
                    label: 'Division ' + division,
                  }),
                  $(Fragment, {
                    children: teamsOfDiv.map((team) => {
                      return $(FormRow, {
                        key: team.id,
                        children: addkeys([
                          $(InputNumber, {
                            width: theme.fib[8],
                            value:
                              finalResults?.find((i) => i.teamId === team.id)
                                ?.position ?? undefined,
                            valueSet: (position) =>
                              setFinalResults((frs) =>
                                frs.some((fr) => fr.teamId === team.id)
                                  ? frs.map((fr) => {
                                      return fr.teamId === team.id
                                        ? {...fr, position}
                                        : fr
                                    })
                                  : frs.concat({teamId: team.id, position})
                              ),
                          }),
                          $(FormLabel, {
                            label: team.name,
                            background: team.color,
                            grow: true,
                          }),
                        ]),
                      })
                    }),
                  }),
                ]),
              })
            }),
          }),
          $(FormBadge, {
            label: $updateSeason.loading ? 'Loading' : 'Submit',
            disabled: $updateSeason.loading,
            click: () => {
              $updateSeason
                .fetch({...season, seasonId: season.id, finalResults})
                .then(done)
            },
          }),
        ]),
      }),
    ]),
  })
}
