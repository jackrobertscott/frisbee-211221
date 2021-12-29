import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$ReportCreate, $ReportGetRound} from '../endpoints/Report'
import {$RoundListOfSeason} from '../endpoints/Round'
import {TRound} from '../schemas/Round'
import {TTeam} from '../schemas/Team'
import {TUser} from '../schemas/User'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormButton} from './Form/FormButton'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {FormSpinner} from './Form/FormSpinner'
import {FormStatic} from './Form/FormStatic'
import {InputNumber} from './Input/InputNumber'
import {InputSelect} from './Input/InputSelect'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
/**
 *
 */
export const ReportCreate: FC<{
  close: () => void
  done: () => void
}> = ({close, done}) => {
  const auth = useAuth()
  const [rounds, roundsSet] = useState<TRound[]>()
  const [against, againstSet] = useState<{team: TTeam; users: TUser[]}>()
  const $roundList = useEndpoint($RoundListOfSeason)
  const $roundAgainst = useEndpoint($ReportGetRound)
  const $create = useEndpoint($ReportCreate)
  const form = useForm({
    teamId: auth.current?.team?.id,
    roundId: undefined as undefined | string,
    scoreFor: undefined as undefined | number,
    scoreAgainst: undefined as undefined | number,
    mvpMale: undefined as undefined | string,
    mvpFemale: undefined as undefined | string,
  })
  useEffect(() => {
    if (auth.current?.season)
      $roundList.fetch({seasonId: auth.current?.season.id}).then(roundsSet)
  }, [])
  useEffect(() => {
    if (form.data.roundId && auth.current?.team) {
      $roundAgainst
        .fetch({roundId: form.data.roundId, teamId: auth.current?.team.id})
        .then(({teamAgainst, users}) => againstSet({team: teamAgainst, users}))
    }
  }, [form.data.roundId])
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        title: 'Score Report',
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Form, {
        children: addkeys([
          rounds === undefined
            ? $(FormSpinner)
            : $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Round'}),
                  $(InputSelect, {
                    value: form.data.roundId,
                    valueSet: form.link('roundId'),
                    options: rounds.map((i) => ({
                      key: i.id,
                      label: `${i.title} - ${dayjs(i.date).format('DD/MM/YY')}`,
                    })),
                  }),
                ]),
              }),
          $(Fragment, {
            children:
              form.data.roundId &&
              addkeys([
                auth.current?.team &&
                  against &&
                  $('div', {
                    className: css({
                      textAlign: 'center',
                    }),
                    children: $(FormRow, {
                      children: addkeys([
                        $(FormStatic, {
                          label: auth.current.team.name,
                          background: auth.current.team.color,
                        }),
                        $(FormStatic, {
                          label: 'vs',
                        }),
                        $(FormStatic, {
                          label: against.team.name,
                          background: against.team.color,
                        }),
                      ]),
                    }),
                  }),
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'Your Score'}),
                    $(InputNumber, {
                      value: form.data.scoreFor,
                      valueSet: form.link('scoreFor'),
                    }),
                  ]),
                }),
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'Opposition Score'}),
                    $(InputNumber, {
                      value: form.data.scoreAgainst,
                      valueSet: form.link('scoreAgainst'),
                    }),
                  ]),
                }),
                against?.users &&
                  $(FormRow, {
                    children: addkeys([
                      $(FormLabel, {label: 'MVP Male'}),
                      $(InputSelect, {
                        value: form.data.mvpMale,
                        valueSet: form.link('mvpMale'),
                        options: against.users
                          .filter((i) => i.gender === 'male')
                          .map((i) => ({
                            key: i.id,
                            label: `${i.firstName} ${i.lastName}`,
                          })),
                      }),
                    ]),
                  }),
                against?.users &&
                  $(FormRow, {
                    children: addkeys([
                      $(FormLabel, {label: 'MVP Female'}),
                      $(InputSelect, {
                        value: form.data.mvpMale,
                        valueSet: form.link('mvpFemale'),
                        options: against.users
                          .filter((i) => i.gender === 'female')
                          .map((i) => ({
                            key: i.id,
                            label: `${i.firstName} ${i.lastName}`,
                          })),
                      }),
                    ]),
                  }),
                $(FormButton, {
                  disabled: $create.loading,
                  label: $create.loading ? 'Loading' : 'Submit',
                  click: () => $create.fetch(form.data as any).then(done),
                }),
              ]),
          }),
        ]),
      }),
    ]),
  })
}
