import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$TeamListOfSeason} from '../endpoints/Team'
import {TRound} from '../schemas/Round'
import {TTeam} from '../schemas/Team'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormColumn} from './Form/FormColumn'
import {FormRow} from './Form/FormRow'
import {FormStatic} from './Form/FormStatic'
import {InputNumber} from './Input/InputNumber'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
interface TRoundForm {
  title: string
  date: string
  games: TRound['games']
}
/**
 *
 */
export const RoundTallyForm: FC<{
  round: TRound
  loading?: boolean
  close: () => void
  done: (round: TRoundForm) => void
}> = ({round: _round, loading, close, done}) => {
  const auth = useAuth()
  const $teamList = useEndpoint($TeamListOfSeason)
  const [teams, teamsSet] = useState<TTeam[]>()
  const form = useForm<TRoundForm>(_round)
  useEffect(() => {
    if (auth.current?.season)
      $teamList.fetch({seasonId: auth.current.season.id}).then((_teams) => {
        teamsSet(_teams)
      })
  }, [])
  return $(Modal, {
    width: 987 + 13 * 2,
    children: addkeys([
      $(TopBar, {
        title: _round.title,
        children: addkeys([
          $(TopBarBadge, {
            label: dayjs(_round.date).format('D MMM YYYY'),
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinorColor,
        children: addkeys([
          $(Fragment, {
            children:
              !!teams?.length &&
              $(FormColumn, {
                children: form.data.games.map((game) => {
                  const team1 = teams.find((i) => i.id === game.team1Id)
                  const team2 = teams.find((i) => i.id === game.team2Id)
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
                        $(FormStatic, {
                          label: team1?.name ?? '...',
                          background: team1?.color,
                        }),
                        $(InputNumber, {
                          value: game.team1Score,
                          valueSet: (team1Score) => gamePatch({team1Score}),
                          placeholder: `${team1?.name} Score`,
                        }),
                        $(FormStatic, {
                          label: team2?.name ?? '...',
                          background: team2?.color,
                        }),
                        $(InputNumber, {
                          value: game.team2Score,
                          valueSet: (team2Score) => gamePatch({team2Score}),
                          placeholder: `${team2?.name} Score`,
                        }),
                      ].map((child, index) => {
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
          }),
          $(FormButton, {
            disabled: loading,
            label: loading ? 'Loading' : 'Submit',
            click: () => done(form.data),
          }),
        ]),
      }),
    ]),
  })
}
