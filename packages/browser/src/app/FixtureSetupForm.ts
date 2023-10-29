import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {TFixture} from '../../../shared/src/schemas/ioFixture'
import {TTeam} from '../../../shared/src/schemas/ioTeam'
import {$TeamListOfSeason} from '../endpoints/Team'
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
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
interface TFixtureForm {
  title: string
  date?: string
  games: Partial<TFixture['games'][number]>[]
  grading: boolean
}
/**
 *
 */
export const FixtureSetupForm: FC<{
  fixture?: TFixture
  loading?: boolean
  close: () => void
  done: (fixture: TFixtureForm) => void
}> = ({fixture: _round, loading, close, done}) => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const form = useForm<TFixtureForm>({
    title: '',
    date: undefined,
    games: [],
    grading: false,
    ..._round,
  })
  const teamsChosen = spreadify(teams).filter((i) => {
    const index = form.data.games.findIndex((g) => {
      return g.team1Id === i.id || g.team2Id === i.id
    })
    return index >= 0
  })
  useEffect(() => {
    $teamList.fetch({seasonId: auth.season!.id}).then((i) => {
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
  return $(Modal, {
    width: theme.fib[14],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'New Fixture',
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
                        children: addkeys(
                          [
                            $(InputSelect, {
                              minWidth: theme.fib[9],
                              value: game.team1Id,
                              valueSet: (team1Id) => gamePatch({team1Id}),
                              options: teams.map((i) => ({
                                key: i.id,
                                label: i.name,
                                color: i.color,
                                icon:
                                  teamsChosen.findIndex((x) => x.id === i.id) >=
                                  0
                                    ? 'check'
                                    : undefined,
                              })),
                            }),
                            $(InputSelect, {
                              minWidth: theme.fib[9],
                              value: game.team2Id,
                              valueSet: (team2Id) => gamePatch({team2Id}),
                              options: teams.map((i) => ({
                                key: i.id,
                                label: i.name,
                                color: i.color,
                                icon:
                                  teamsChosen.findIndex((x) => x.id === i.id) >=
                                  0
                                    ? 'check'
                                    : undefined,
                              })),
                            }),
                            $(InputString, {
                              value: game.time,
                              valueSet: (time) => gamePatch({time}),
                              placeholder: 'Time',
                            }),
                            $(InputString, {
                              value: game.place,
                              valueSet: (place) => gamePatch({place}),
                              placeholder: 'Place',
                            }),
                            $(FormBadge, {
                              icon: 'times',
                              click: () =>
                                form.patch({
                                  games: form.data.games.filter((i) => {
                                    return i.id !== game.id
                                  }),
                                }),
                            }),
                          ].map((child, index, all) => {
                            if (all.length - 1 === index) return child
                            return $('div', {
                              children: child,
                              className: css({
                                flexGrow: 1,
                                flexShrink: 1,
                                flexBasis: 0,
                                overflow: 'hidden',
                                display: 'flex',
                              }),
                            })
                          })
                        ),
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
              }),
            ]),
          }),
          $(FormBadge, {
            disabled: loading,
            label: loading ? 'Loading' : 'Submit',
            click: () => done(form.data),
          }),
        ]),
      }),
    ]),
  })
}
