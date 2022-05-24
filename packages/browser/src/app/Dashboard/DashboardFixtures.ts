import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {
  $FixtureCreate,
  $FixtureListOfSeason,
  $FixtureSnapshot,
  $FixtureUpdate,
} from '../../endpoints/Fixture'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {TFixture} from '../../schemas/ioFixture'
import {TTeam} from '../../schemas/ioTeam'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
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
import {useMedia} from '../Media/useMedia'
import {initials} from '../../utils/initials'
import {FormRow} from '../Form/FormRow'
import {download} from '../../utils/download'
/**
 *
 */
export const DashboardFixtures: FC = () => {
  const auth = useAuth()
  const $fixtureCreate = useEndpoint($FixtureCreate)
  const $fixtureUpdate = useEndpoint($FixtureUpdate)
  const $teamList = useEndpoint($TeamListOfSeason)
  const $fixtureList = useEndpoint($FixtureListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [creating, creatingSet] = useState(false)
  const [editing, editingSet] = useState<TFixture>()
  const [openfxs, openfxsSet] = useLocalState<string[]>('frisbee.fixtures', [])
  const reload = () => {
    const seasonId = auth.season!.id
    $teamList.fetch({seasonId}).then((i) => teamsSet(i.teams))
    $fixtureList.fetch({seasonId}).then((i) => {
      if (fixtures === undefined && i[0] && !openfxs.includes(i[0].id))
        openfxsSet((x) => [...x, i[0].id])
      fixturesSet(i)
    })
  }
  useEffect(() => reload(), [])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(Fragment, {
            children:
              auth.isAdmin() &&
              $(FormBadge, {
                label: 'Add Fixture',
                background: theme.bgAdmin,
                click: () => creatingSet(true),
              }),
          }),
          $(Fragment, {
            children:
              fixtures === undefined || teams === undefined
                ? $(Spinner)
                : $('div', {
                    className: css({
                      '& > *:not(:last-child)': {
                        marginBottom: theme.fib[5],
                      },
                    }),
                    children: fixtures.length
                      ? fixtures.map((fixture) => {
                          return $(_DashboardFixturesView, {
                            key: fixture.id,
                            fixture,
                            teams,
                            isAdmin: auth.isAdmin(),
                            open: openfxs.includes(fixture.id),
                            editingSet,
                            toggle: () =>
                              openfxsSet((i) => {
                                return i.includes(fixture.id)
                                  ? i.filter((x) => x !== fixture.id)
                                  : i.concat(fixture.id)
                              }),
                          })
                        })
                      : $('div', {
                          children: 'No Fixtures Yet',
                          className: css({
                            color: theme.fontMinor.string(),
                            padding: theme.padify(theme.fib[4]),
                            textAlign: 'center',
                          }),
                        }),
                  }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          creating &&
          $(FixtureSetupForm, {
            loading: $fixtureCreate.loading,
            close: () => creatingSet(false),
            done: (data) =>
              $fixtureCreate
                .fetch({
                  ...data,
                  date: data.date!,
                  games: data.games as TFixture['games'],
                  seasonId: auth.season!.id,
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
            loading: $fixtureUpdate.loading,
            close: () => editingSet(undefined),
            done: (data) =>
              $fixtureUpdate
                .fetch({
                  ...data,
                  date: data.date!,
                  games: data.games as TFixture['games'],
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
const _DashboardFixturesView: FC<{
  fixture: TFixture
  teams: TTeam[]
  open: boolean
  isAdmin: boolean
  toggle: () => void
  editingSet: (fixture: TFixture) => void
}> = ({fixture, teams, open, isAdmin, toggle, editingSet}) => {
  const media = useMedia()
  const isSmall = media.width < theme.fib[13]
  const $fixtureSnapshot = useEndpoint($FixtureSnapshot)
  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $('div', {
            onClick: () => toggle(),
            className: css({
              flexGrow: 1,
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
                    children: dayjs(fixture.date).format(
                      isSmall ? 'DD/MM/YY' : 'D MMM YYYY'
                    ),
                  }),
                  $(Icon, {
                    icon: open ? 'angle-up' : 'angle-down',
                    multiple: 1,
                  }),
                ]),
              }),
            ]),
          }),
          $(FormBadge, {
            background: theme.bgMinor,
            icon: $fixtureSnapshot.loading ? 'spinner' : 'download',
            label: $fixtureSnapshot.loading ? 'Loading' : 'Download',
            click: () =>
              !$fixtureSnapshot.loading &&
              $fixtureSnapshot.fetch({fixtureId: fixture.id}).then((blob) => {
                if (blob.type !== 'image/png')
                  throw new Error('Failed: only png images are supported.')
                download.blob(blob, `${fixture.title}.png`)
              }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          open &&
          $(FormColumn, {
            children: addkeys([
              $(Table, {
                head: {
                  one: {label: 'Team 1', grow: isSmall ? 2 : 3},
                  two: {label: 'Team 2', grow: isSmall ? 2 : 3},
                  time: {label: 'Time', grow: isSmall ? 3 : 2},
                  place: {label: 'Place', grow: isSmall ? 3 : 2},
                },
                body: fixture.games.map((game) => {
                  const team1 = teams.find((i) => i.id === game.team1Id)
                  const team2 = teams.find((i) => i.id === game.team2Id)
                  return {
                    key: game.id,
                    data: {
                      one: {
                        value: isSmall
                          ? initials(team1?.name)
                          : team1?.name ?? '[unknown]',
                        color: team1?.color,
                      },
                      two: {
                        value: isSmall
                          ? initials(team2?.name)
                          : team2?.name ?? '[unknown]',
                        color: team2?.color,
                      },
                      time: {value: game.time},
                      place: {value: game.place},
                    },
                  }
                }),
              }),
              $(Fragment, {
                children:
                  isAdmin &&
                  $(FormBadge, {
                    label: 'Edit Fixture',
                    background: theme.bgAdmin,
                    click: () => editingSet(fixture),
                  }),
              }),
            ]),
          }),
      }),
    ]),
  })
}
