import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$ReportCreate, $ReportGetRound} from '../endpoints/Report'
import {$RoundListOfSeason} from '../endpoints/Fixture'
import {TRound} from '../schemas/ioFixture'
import {TTeam} from '../schemas/ioTeam'
import {TUser} from '../schemas/ioUser'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {FormRow} from './Form/FormRow'
import {InputNumber} from './Input/InputNumber'
import {InputSelect} from './Input/InputSelect'
import {Modal} from './Modal'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
import {InputTextarea} from './Input/InputTextarea'
import {FormHelp} from './Form/FormHelp'
import {Spinner} from './Spinner'
import {FormBadge} from './Form/FormBadge'
import {hsla} from '../utils/hsla'
import {FormLabel} from './Form/FormLabel'
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
    spirit: undefined as undefined | number,
    spiritComment: '',
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
        background: theme.bgMinor,
        children: addkeys([
          rounds === undefined
            ? $(Spinner)
            : $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Fixture'}),
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
                        $(FormBadge, {
                          label: auth.current.team.name,
                          background: hsla.digest(auth.current.team.color),
                        }),
                        $(FormBadge, {
                          label: 'vs',
                        }),
                        $(FormBadge, {
                          label: against.team.name,
                          background: hsla.digest(against.team.color),
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
                        value: form.data.mvpFemale,
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
                $(FormColumn, {
                  children: addkeys([
                    $(FormLabel, {label: 'Spirit'}),
                    $(InputSelect, {
                      value: form.data.spirit?.toString(),
                      valueSet: (i) => form.patch({spirit: +i}),
                      options: [
                        {
                          key: '0',
                          label: `0: They were not fair minded, or did not know the rules, or were not willing to communicate.`,
                        },
                        {
                          key: '1',
                          label: `1: They were somewhat fair minded, or didn't have a good rules knowledge.`,
                        },
                        {
                          key: '2',
                          label: `2: They were fair minded, and had sufficient rules knowledge.`,
                        },
                        {
                          key: '3',
                          label: `3: They upheld the truth of a situation even if it didn't benefit them, or displayed advanced rules knowledge.`,
                        },
                        {
                          key: '4',
                          label: `4: This team was god-tier in their attitudes on and off the field.`,
                        },
                      ],
                    }),
                    typeof form.data.spirit === 'number' &&
                      $(FormRow, {
                        children: addkeys([
                          $(InputTextarea, {
                            rows: 2,
                            value: form.data.spiritComment,
                            valueSet: form.link('spiritComment'),
                            placeholder: 'Write a comment (optional) ...',
                          }),
                        ]),
                      }),
                    $(FormHelp, {
                      children: addkeys([
                        'See ',
                        $('a', {
                          href: 'https://d36m266ykvepgv.cloudfront.net/uploads/media/vQLbEryD9k/o/wfdf-spirit-scoring-examples.pdf',
                          target: '_blank',
                          children: 'here',
                        }),
                        ' for more details regarding spirit scores.',
                      ]),
                    }),
                  ]),
                }),
                $(FormBadge, {
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
