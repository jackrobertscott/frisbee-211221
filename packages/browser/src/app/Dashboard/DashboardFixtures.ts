import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $RoundCreate,
  $RoundListOfSeason,
  $RoundUpdate,
} from '../../endpoints/Fixture'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {TFixture} from '../../schemas/ioFixture'
import {TTeam} from '../../schemas/ioTeam'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {fadein} from '../../utils/keyframes'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {Icon} from '../Icon'
import {FixtureSetupForm} from '../FixtureSetupForm'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useEndpoint} from '../useEndpoint'
import {useLocalState} from '../useLocalState'
import {FormColumn} from '../Form/FormColumn'
/**
 *
 */
export const DashboardFixtures: FC = () => {
  const auth = useAuth()
  const $roundCreate = useEndpoint($RoundCreate)
  const $roundUpdate = useEndpoint($RoundUpdate)
  const $teamList = useEndpoint($TeamListOfSeason)
  const $roundList = useEndpoint($RoundListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [rounds, roundsSet] = useState<TFixture[]>()
  const [creating, creatingSet] = useState(false)
  const [editing, editingSet] = useState<TFixture>()
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
            $(FormBadge, {
              label: 'Add Fixture',
              background: theme.bgAdmin,
              click: () => creatingSet(true),
            }),
          rounds === undefined || teams === undefined
            ? $(Spinner)
            : $('div', {
                className: css({
                  '& > *:not(:last-child)': {
                    marginBottom: theme.fib[5],
                  },
                }),
                children: rounds.length
                  ? rounds.map((fixture) => {
                      return $(_DashboardFixturesCreate, {
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
                    })
                  : $('div', {
                      children: 'No Rounds Yet',
                      className: css({
                        color: theme.fontMinor.string(),
                        padding: theme.padify(theme.fib[4]),
                        textAlign: 'center',
                      }),
                    }),
              }),
        ]),
      }),
      $(Fragment, {
        children:
          creating &&
          $(FixtureSetupForm, {
            loading: $roundCreate.loading,
            close: () => creatingSet(false),
            done: (data) =>
              auth.current?.season &&
              $roundCreate
                .fetch({
                  ...data,
                  date: data.date!,
                  games: data.games as TFixture['games'],
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
          $(FixtureSetupForm, {
            fixture: editing,
            loading: $roundUpdate.loading,
            close: () => editingSet(undefined),
            done: (data) =>
              $roundUpdate
                .fetch({
                  ...data,
                  date: data.date!,
                  games: data.games as TFixture['games'],
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
const _DashboardFixturesCreate: FC<{
  fixture: TFixture
  teams: TTeam[]
  open: boolean
  isAdmin: boolean
  toggle: () => void
  editingSet: (fixture: TFixture) => void
}> = ({fixture, teams, open, isAdmin, toggle, editingSet}) => {
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
                one: {label: 'Team 1', grow: 2},
                two: {label: 'Team 2', grow: 2},
                time: {label: 'Time', grow: 1},
                place: {label: 'Place', grow: 1},
              },
              body: fixture.games.map((game) => {
                const team1 = teams.find((i) => i.id === game.team1Id)
                const team2 = teams.find((i) => i.id === game.team2Id)
                return {
                  key: game.id,
                  data: {
                    one: {value: team1?.name, color: team1?.color},
                    two: {value: team2?.name, color: team2?.color},
                    time: {value: game.time},
                    place: {value: game.place},
                  },
                }
              }),
            }),
            isAdmin &&
              $(FormBadge, {
                label: 'Edit Fixture',
                background: theme.bgAdmin,
                click: () => editingSet(fixture),
              }),
          ]),
        }),
    ]),
  })
}
