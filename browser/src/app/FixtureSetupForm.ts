import {css} from '@emotion/css'
import type {CSSObject} from '@emotion/css/dist/declarations/src/create-instance'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {
  createElement as $,
  FC,
  Fragment,
  type ReactNode,
  useEffect,
  useState,
} from 'react'
import {$FeatureFixtureSetupLoad} from '../endpoints/Feature'
import {
  $FixtureCreate,
  $FixtureDelete,
  $FixtureUpdate,
} from '../endpoints/Fixture'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {random} from '../utils/random'
import {spreadify} from '../utils/spreadify'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputBoolean} from './Input/InputBoolean'
import {InputDate} from './Input/InputDate'
import {InputSelect} from './Input/InputSelect'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {Question} from './Question'
import {Table} from './Table'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'

interface TFixtureForm {
  title: string
  date?: string
  games: Partial<TFixture['games'][number]>[]
  grading: boolean
}

type TFixtureFormGame = TFixtureForm['games'][number]
type TFixtureFormGameWithId = TFixtureFormGame & {id: string}

const FIXTURE_GAME_FIELD_CLASS = css({
  flexGrow: 1,
  minWidth: 0,
  flexShrink: 1,
  flexBasis: 0,
  overflow: 'hidden',
  display: 'flex',
})

const fixtureGameField = (children: ReactNode) =>
  $('div', {
    children,
    className: FIXTURE_GAME_FIELD_CLASS,
  })

const formatFixtureSwapTeamName = (teams: TTeam[], teamId?: string) => {
  if (!teamId) return 'Unassigned'
  return teams.find((team) => team.id === teamId)?.name ?? '[unknown]'
}

const formatFixtureSwapMatchup = (game: TFixtureFormGame, teams: TTeam[]) => {
  return [
    formatFixtureSwapTeamName(teams, game.team1Id),
    formatFixtureSwapTeamName(teams, game.team2Id),
  ].join(' v ')
}

const formatFixtureSwapSlot = (game: TFixtureFormGame) => {
  const time = game.time?.trim() || 'No time'
  const place = game.place?.trim() || 'No field'
  return `${time} • ${place}`
}

const FIXTURE_SWAP_ROW_BP = theme.fib[13]
const FIXTURE_SWAP_LABEL_WIDTH = theme.fib[9]
const FIXTURE_SWAP_TEXT_STYLE: CSSObject = {
  flexShrink: 1,
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
}
const FIXTURE_SWAP_FIXED_LABEL_STYLE: CSSObject = {
  [theme.ltMedia(FIXTURE_SWAP_ROW_BP)]: {
    width: 'auto',
  },
}

export const FixtureSetupForm: FC<{
  fixture?: TFixture
  close: () => void
  done: () => void
}> = ({fixture: _fixture, close, done}) => {
  const auth = useAuth()
  const [deleting, deletingSet] = useState(false)
  const $fixtureCreate = useEndpoint($FixtureCreate)
  const $fixtureUpdate = useEndpoint($FixtureUpdate)
  const $fixtureDelete = useEndpoint($FixtureDelete)
  const $setupLoad = useEndpoint($FeatureFixtureSetupLoad)
  const [teams, teamsSet] = useState<TTeam[]>()
  const [swapGameId, swapGameIdSet] = useState<string>()
  const form = useForm<TFixtureForm>({
    title: '',
    date: undefined,
    games: [],
    grading: false,
    ..._fixture,
  })
  const loading = $fixtureCreate.loading || $fixtureUpdate.loading
  const teamsChosen = spreadify(teams).filter((i) => {
    const index = form.data.games.findIndex((g) => {
      return g.team1Id === i.id || g.team2Id === i.id
    })
    return index >= 0
  })
  const swapGameSlot = (targetGameId: string) => {
    if (!swapGameId || swapGameId === targetGameId) {
      swapGameIdSet(undefined)
      return
    }

    const sourceGame = form.data.games.find((game) => game.id === swapGameId)
    const targetGame = form.data.games.find((game) => game.id === targetGameId)

    if (!sourceGame || !targetGame) {
      swapGameIdSet(undefined)
      return
    }

    form.patch({
      games: form.data.games.map((game) => {
        if (game.id === swapGameId) {
          return {...game, time: targetGame.time, place: targetGame.place}
        }
        if (game.id === targetGameId) {
          return {...game, time: sourceGame.time, place: sourceGame.place}
        }
        return game
      }),
    })
    swapGameIdSet(undefined)
  }
  const swapSourceGame = form.data.games.find((game) => game.id === swapGameId)
  useEffect(() => {
    $setupLoad.fetch({seasonId: auth.season!.id}).then((i) => {
      teamsSet(i.teams)
      if (!form.data.games.length) {
        form.patch({
          games: new Array(Math.floor(i.teams.length / 2))
            .fill(0)
            .map(() => ({id: random.randomString()})),
        })
      }
    })
  }, [])
  return $(Fragment, {
    children: addkeys([
      $(Modal, {
        width: theme.fib[14],
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(TopBarBadge, {
                grow: true,
                label: _fixture ? 'Edit Fixture' : 'New Fixture',
              }),
              _fixture &&
                $(TopBarBadge, {
                  icon: 'trash-alt',
                  label: 'Delete',
                  click: () => deletingSet(true),
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
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Title'}),
                  $(InputString, {
                    value: form.data.title,
                    valueSet: form.link('title'),
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Date'}),
                  $(InputDate, {
                    value: form.data.date,
                    valueSet: form.link('date'),
                  }),
                ]),
              }),
              $(Fragment, {
                children:
                  !!teams?.length &&
                  $(FormColumn, {
                    children: addkeys([
                      $(Fragment, {
                        children: form.data.games.map((game) => {
                          const gamePatch = (data: Partial<typeof game>) =>
                            form.patch({
                              games: form.data.games.map((i) => {
                                return i.id === game.id ? {...game, ...data} : i
                              }),
                            })
                          return $(FormRow, {
                            key: game.id,
                            bpColumn: theme.fib[13],
                            children: addkeys([
                              fixtureGameField(
                                $(InputSelect, {
                                  minWidth: theme.fib[9],
                                  value: game.team1Id,
                                  valueSet: (team1Id) => gamePatch({team1Id}),
                                  options: teams.map((i) => ({
                                    key: i.id,
                                    label: i.name,
                                    color: i.color,
                                    icon:
                                      teamsChosen.findIndex(
                                        (x) => x.id === i.id,
                                      ) >= 0
                                        ? 'check'
                                        : undefined,
                                  })),
                                }),
                              ),
                              fixtureGameField(
                                $(InputSelect, {
                                  minWidth: theme.fib[9],
                                  value: game.team2Id,
                                  valueSet: (team2Id) => gamePatch({team2Id}),
                                  options: teams.map((i) => ({
                                    key: i.id,
                                    label: i.name,
                                    color: i.color,
                                    icon:
                                      teamsChosen.findIndex(
                                        (x) => x.id === i.id,
                                      ) >= 0
                                        ? 'check'
                                        : undefined,
                                  })),
                                }),
                              ),
                              fixtureGameField(
                                $(InputString, {
                                  value: game.time,
                                  valueSet: (time) => gamePatch({time}),
                                  placeholder: 'Time',
                                }),
                              ),
                              fixtureGameField(
                                $(InputString, {
                                  value: game.place,
                                  valueSet: (place) => gamePatch({place}),
                                  placeholder: 'Place',
                                }),
                              ),
                              $(FormBadge, {
                                icon: 'shuffle',
                                title: 'Swap time and field',
                                background: theme.bgAdminButton,
                                noshrink: true,
                                disabled:
                                  !game.id || form.data.games.length < 2,
                                click: () => swapGameIdSet(game.id),
                              }),
                              $(FormBadge, {
                                icon: 'times',
                                title: 'Remove game',
                                noshrink: true,
                                click: () =>
                                  form.patch({
                                    games: form.data.games.filter((i) => {
                                      return i.id !== game.id
                                    }),
                                  }),
                              }),
                            ]),
                          })
                        }),
                      }),
                      $(FormBadge, {
                        icon: 'plus',
                        label: 'Add New Game',
                        click: () =>
                          form.patch({
                            games: form.data.games.concat({
                              id: random.randomString(),
                            }),
                          }),
                      }),
                    ]),
                  }),
              }),
              $(FormColumn, {
                children: addkeys([
                  $(FormRow, {
                    children: addkeys([
                      $(FormLabel, {label: 'Is Grading'}),
                      $(InputBoolean, {
                        value: form.data.grading,
                        valueSet: form.link('grading'),
                      }),
                    ]),
                  }),
                  $(FormLabel, {
                    font: theme.fontMinor,
                    background: theme.bgMinor,
                    label:
                      'The results of this fixture will not be included in the ladder.',
                    wrap: true,
                    style: FIXTURE_SWAP_TEXT_STYLE,
                  }),
                ]),
              }),
              $(FormBadge, {
                disabled: loading,
                label: loading ? 'Loading' : 'Submit',
                click: () => {
                  if (!_fixture) {
                    $fixtureCreate
                      .fetch({
                        ...form.data,
                        date: form.data.date!,
                        games: form.data.games as TFixture['games'],
                        seasonId: auth.season!.id,
                      })
                      .then(() => done())
                  } else {
                    $fixtureUpdate
                      .fetch({
                        ...form.data,
                        date: form.data.date!,
                        games: form.data.games as TFixture['games'],
                        fixtureId: _fixture.id,
                      })
                      .then(() => done())
                  }
                },
              }),
            ]),
          }),
        ]),
      }),

      $(Fragment, {
        children:
          teams &&
          swapSourceGame &&
          $(FixtureSwapForm, {
            sourceGame: swapSourceGame,
            games: form.data.games,
            teams,
            close: () => swapGameIdSet(undefined),
            swap: swapGameSlot,
          }),
      }),

      $(Fragment, {
        children:
          deleting &&
          _fixture &&
          $(Question, {
            title: 'Delete Fixture',
            description: `Are you sure you wish to permanently delete this fixture?`,
            close: () => deletingSet(false),
            options: [
              {label: 'Cancel', click: () => deletingSet(false)},
              {
                label: $fixtureDelete.loading ? 'Loading' : 'Delete',
                click: () =>
                  $fixtureDelete.fetch({fixtureId: _fixture.id}).then(() => {
                    done()
                    deletingSet(false)
                  }),
              },
            ],
          }),
      }),
    ]),
  })
}

const FixtureSwapForm: FC<{
  sourceGame: TFixtureFormGame
  games: TFixtureFormGame[]
  teams: TTeam[]
  close: () => void
  swap: (targetGameId: string) => void
}> = ({sourceGame, games, teams, close, swap}) => {
  const targetGames: TFixtureFormGameWithId[] = games.filter(
    (game): game is TFixtureFormGameWithId => {
      return typeof game.id === 'string' && game.id !== sourceGame.id
    },
  )

  return $(Modal, {
    close,
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Swap Game Slot',
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
          $(FormLabel, {
            background: theme.bgMinor,
            font: theme.fontMinor,
            label:
              'Choose another game to swap time and field with. Teams and scores stay on their original games.',
            wrap: true,
            style: FIXTURE_SWAP_TEXT_STYLE,
          }),
          $(FormColumn, {
            children: addkeys([
              $(FormRow, {
                bpColumn: FIXTURE_SWAP_ROW_BP,
                children: addkeys([
                  $(FormLabel, {
                    label: 'Selected Game',
                    width: FIXTURE_SWAP_LABEL_WIDTH,
                    wrap: true,
                    style: FIXTURE_SWAP_FIXED_LABEL_STYLE,
                  }),
                  $(FormLabel, {
                    label: formatFixtureSwapMatchup(sourceGame, teams),
                    background: theme.bg,
                    grow: true,
                    wrap: true,
                    style: FIXTURE_SWAP_TEXT_STYLE,
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: FIXTURE_SWAP_ROW_BP,
                children: addkeys([
                  $(FormLabel, {
                    label: 'Current Slot',
                    width: FIXTURE_SWAP_LABEL_WIDTH,
                    wrap: true,
                    style: FIXTURE_SWAP_FIXED_LABEL_STYLE,
                  }),
                  $(FormLabel, {
                    label: formatFixtureSwapSlot(sourceGame),
                    background: theme.bg,
                    grow: true,
                    wrap: true,
                    style: FIXTURE_SWAP_TEXT_STYLE,
                  }),
                ]),
              }),
            ]),
          }),
          $(Table, {
            head: {
              game: {label: 'Swap With', grow: 3},
              slot: {label: 'Slot', grow: 2},
              action: {label: '', grow: 1},
            },
            empty: 'Add another game before swapping.',
            body: targetGames.map((game) => {
              return {
                key: game.id,
                click: () => swap(game.id),
                data: {
                  game: {
                    children: $(FormLabel, {
                      label: formatFixtureSwapMatchup(game, teams),
                      grow: true,
                      wrap: true,
                      style: FIXTURE_SWAP_TEXT_STYLE,
                    }),
                  },
                  slot: {
                    children: $(FormLabel, {
                      label: formatFixtureSwapSlot(game),
                      font: theme.fontMinor,
                      grow: true,
                      wrap: true,
                      style: FIXTURE_SWAP_TEXT_STYLE,
                    }),
                  },
                  action: {
                    children: $(FormLabel, {
                      icon: 'shuffle',
                      title: 'Swap with this game',
                      background: theme.bgAdminButton,
                      grow: true,
                    }),
                  },
                },
              }
            }),
          }),
        ]),
      }),
    ]),
  })
}
