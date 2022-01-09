import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TFixture} from '../schemas/ioFixture'
import {TTeam} from '../schemas/ioTeam'
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
import {InputDate} from './Input/InputDate'
import {InputSelect} from './Input/InputSelect'
import {InputString} from './Input/InputString'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
interface TFixtureForm {
  title: string
  date?: string
  games: Partial<TFixture['games'][number]>[]
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
    ..._round,
  })
  const teamsChosen = spreadify(teams).filter((i) => {
    const index = form.data.games.findIndex((g) => {
      return g.team1Id === i.id || g.team2Id === i.id
    })
    return index >= 0
  })
  useEffect(() => {
    if (auth.current?.season)
      $teamList.fetch({seasonId: auth.current.season.id}).then((_teams) => {
        teamsSet(_teams)
        if (!form.data.games.length) {
          form.patch({
            games: new Array(Math.floor(_teams.length / 2))
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
        title: 'New Fixture',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
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
