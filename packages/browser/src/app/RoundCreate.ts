import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$RoundCreate} from '../endpoints/Round'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TRound} from '../schemas/Round'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {random} from '../utils/random'
import {spreadify} from '../utils/spreadify'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormButton} from './Form/FormButton'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
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
export const RoundCreate: FC<{
  close: () => void
  done: (round: TRound) => void
}> = ({close, done}) => {
  const auth = useAuth()
  const $create = useEndpoint($RoundCreate)
  const $teamList = useEndpoint($TeamListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const form = useForm({
    title: '',
    games: [] as Partial<TRound['games'][number]>[],
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
        form.patch({
          games: new Array(Math.floor(_teams.length / 2))
            .fill(0)
            .map(() => ({id: random.randomString()})),
        })
      })
  }, [])
  return $(Modal, {
    width: 987 + 13 * 2,
    children: addkeys([
      $(TopBar, {
        title: 'New Round',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
        background: theme.bgMinorColor,
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
                              minWidth: 89,
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
                              minWidth: 89,
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
                                width: '25%',
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
                  $(FormButton, {
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
          $(FormButton, {
            disabled: $create.loading,
            label: $create.loading ? 'Loading' : 'Submit',
            click: () =>
              auth.current?.season &&
              $create.fetch({
                ...form.data,
                games: form.data.games as TRound['games'],
                seasonId: auth.current.season.id,
              }),
          }),
        ]),
      }),
    ]),
  })
}
