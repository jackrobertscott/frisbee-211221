import {authPoint} from '@shared/auth/authAccess'
import {css} from '@emotion/css'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FixtureListOfSeason} from '../../endpoints/Fixture'
import {$TeamListOfSeason} from '../../endpoints/Team'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {initials} from '../../utils/initials'
import {useAuth} from '../Auth/useAuth'
import {FixtureAdjustForm} from '../FixtureAdjustForm'
import {FixtureGenerate} from '../FixtureGenerate'
import {FixtureSetupForm} from '../FixtureSetupForm'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormRow} from '../Form/FormRow'
import {Icon} from '../Icon'
import {useMedia} from '../Media/useMedia'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useEndpoint} from '../useEndpoint'

export const DashboardFixtures: FC = () => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const $fixtureList = useEndpoint($FixtureListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [creating, creatingSet] = useState(false)
  const [editing, editingSet] = useState<TFixture>()
  const [generating, generatingSet] = useState(false)
  const [adjusting, adjustingSet] = useState(false)
  const [openfxs, openfxsSet] = useState<string[]>([])
  const reload = () => {
    const seasonId = auth.season!.id
    $teamList.fetch({seasonId}).then((i) => teamsSet(i.teams))
    $fixtureList.fetch({seasonId}).then((i) => {
      fixturesSet(i)
      const fixturesInFuture = i.filter((f) => {
        return dayjs(f.date).add(1, 'day').isAfter(dayjs())
      })
      openfxsSet(fixturesInFuture.map((f) => f.id))
    })
  }
  useEffect(() => reload(), [])
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          auth.can(authPoint.fixtureManage) &&
            $('div', {
              className: css({
                display: 'flex',
                gap: theme.fib[5],
                [theme.ltMedia(theme.fib[14])]: {
                  flexDirection: 'column',
                },
              }),
              children: addkeys([
                $(FormBadge, {
                  grow: true,
                  icon: 'magic',
                  label: 'Magic Generate',
                  background: theme.bgAdminButton,
                  click: () => generatingSet(true),
                }),
                $(FormBadge, {
                  grow: true,
                  icon: 'plus',
                  label: 'Add Fixture',
                  background: theme.bgAdminButton,
                  click: () => creatingSet(true),
                }),
                $(FormBadge, {
                  grow: true,
                  icon: 'clock',
                  label: 'Adjust Multiple Fixtures',
                  background: theme.bgAdminButton,
                  click: () => adjustingSet(true),
                }),
              ]),
            }),
          $(Fragment, {
            children:
              fixtures === undefined || teams === undefined
                ? $(Spinner)
                : $('div', {
                    className: css({
                      display: 'flex',
                      flexDirection: 'column',
                      gap: theme.fib[5],
                    }),
                    children: fixtures.length
                      ? fixtures.map((fixture) => {
                          return $(_DashboardFixturesView, {
                            key: fixture.id,
                            fixture,
                            teams,
                            isAdmin: auth.can(authPoint.fixtureManage),
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
            close: () => creatingSet(false),
            done: () => {
              reload()
              creatingSet(false)
            },
          }),
      }),
      $(Fragment, {
        children:
          editing &&
          $(FixtureSetupForm, {
            fixture: editing,
            close: () => editingSet(undefined),
            done: () => {
              reload()
              editingSet(undefined)
            },
          }),
      }),
      $(Fragment, {
        children:
          auth.season &&
          generating &&
          $(FixtureGenerate, {
            seasonId: auth.season.id,
            close: () => generatingSet(false),
            done: () => {
              reload()
              generatingSet(false)
            },
          }),
      }),
      $(Fragment, {
        children:
          auth.season &&
          fixtures &&
          adjusting &&
          $(FixtureAdjustForm, {
            fixtures,
            seasonId: auth.season.id,
            close: () => adjustingSet(false),
            done: () => {
              reload()
              adjustingSet(false)
            },
          }),
      }),
    ]),
  })
}

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
  // const $fixtureSnapshot = useEndpoint($FixtureSnapshot)
  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $('div', {
            onClick: () => toggle(),
            className: css({
              flexGrow: 1,
              display: 'flex',
              userSelect: 'none',
              justifyContent: 'space-between',
              border: theme.border(),
              background: theme.bgMinor.string(),
              padding: theme.padify(theme.fib[4]),
              // [theme.ltMedia(theme.fib[14])]: {
              //   flexDirection: 'column',
              // },
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
                  gap: theme.fib[4],
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
          // $(FormBadge, {
          //   noshrink: true,
          //   background: theme.bgMinor,
          //   icon: $fixtureSnapshot.loading ? 'spinner' : 'camera',
          //   label: $fixtureSnapshot.loading ? 'Loading' : 'Save Screenshot',
          //   click: () =>
          //     !$fixtureSnapshot.loading &&
          //     $fixtureSnapshot.fetch({fixtureId: fixture.id}).then((blob) => {
          //       if (blob.type !== 'image/png')
          //         throw new Error('Failed: only png images are supported.')
          //       download.blob(blob, `${fixture.title}.png`)
          //     }),
          // }),
          $(Fragment, {
            children:
              isAdmin &&
              $(FormBadge, {
                icon: 'edit',
                label: 'Edit',
                noshrink: true,
                background: theme.bgAdminButton,
                click: () => editingSet(fixture),
              }),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          open &&
          $(Table, {
            head: {
              one: {label: 'Team 1', grow: isSmall ? 2 : 3},
              two: {label: 'Team 2', grow: isSmall ? 2 : 3},
              time: {label: 'Time', grow: isSmall ? 3 : 2},
              place: {label: 'Place', grow: isSmall ? 3 : 2},
            },
            body: fixture.games
              .sort((a, b) => {
                if (a.time !== b.time) return a.time.localeCompare(b.time)
                return a.place.localeCompare(b.place)
              })
              .map((game) => {
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
      }),
    ]),
  })
}
