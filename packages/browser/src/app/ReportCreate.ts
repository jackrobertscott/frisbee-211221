import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$ReportCreate, $ReportGetFixture} from '../endpoints/Report'
import {$FixtureListOfSeason} from '../endpoints/Fixture'
import {TFixture} from '../schemas/ioFixture'
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
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'
import {InputTextarea} from './Input/InputTextarea'
import {FormHelp} from './Form/FormHelp'
import {Spinner} from './Spinner'
import {FormBadge} from './Form/FormBadge'
import {hsla} from '../utils/hsla'
import {FormLabel} from './Form/FormLabel'
import {useMedia} from './Media/useMedia'
import {initials} from '../utils/initials'
import {useToaster} from './Toaster/useToaster'
/**
 *
 */
export const ReportCreate: FC<{
  close: () => void
  done: () => void
}> = ({close, done}) => {
  const auth = useAuth()
  const media = useMedia()
  const toaster = useToaster()
  const isSmall = media.width < theme.fib[12]
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [against, againstSet] = useState<{team: TTeam; users: TUser[]}>()
  const $fixtureList = useEndpoint($FixtureListOfSeason)
  const $fixtureAgainst = useEndpoint($ReportGetFixture)
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
      $fixtureList.fetch({seasonId: auth.current?.season.id}).then(fixturesSet)
  }, [])
  useEffect(() => {
    if (form.data.roundId && auth.current?.team) {
      $fixtureAgainst
        .fetch({roundId: form.data.roundId, teamId: auth.current?.team.id})
        .then(({teamAgainst, users}) => againstSet({team: teamAgainst, users}))
    }
  }, [form.data.roundId])
  return $(Modal, {
    width: 610,
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Score Report',
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
          fixtures === undefined
            ? $(Spinner)
            : $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Fixture'}),
                  $(InputSelect, {
                    value: form.data.roundId,
                    valueSet: form.link('roundId'),
                    options: fixtures.map((i) => ({
                      key: i.id,
                      label: `${i.title} - ${dayjs(i.date).format('DD/MM/YY')}`,
                    })),
                  }),
                ]),
              }),
          $(Fragment, {
            children: !form.data.roundId
              ? null
              : !auth.current?.team || !against?.users
              ? $(Spinner)
              : addkeys([
                  $('div', {
                    className: css({
                      textAlign: 'center',
                    }),
                    children: $(FormRow, {
                      children: addkeys([
                        $(FormBadge, {
                          grow: true,
                          label: isSmall
                            ? initials(auth.current.team.name)
                            : auth.current.team.name,
                          background: hsla.digest(auth.current.team.color),
                          font: hsla
                            .digest(auth.current.team.color)
                            .compliment(),
                        }),
                        $(FormBadge, {
                          label: 'vs',
                        }),
                        $(FormBadge, {
                          grow: true,
                          label: isSmall
                            ? initials(against.team.name)
                            : against.team.name,
                          background: hsla.digest(against.team.color),
                          font: hsla.digest(against.team.color).compliment(),
                        }),
                      ]),
                    }),
                  }),
                  $(FormColumn, {
                    children: addkeys([
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
                          $(FormLabel, {label: 'Against Score'}),
                          $(InputNumber, {
                            value: form.data.scoreAgainst,
                            valueSet: form.link('scoreAgainst'),
                          }),
                        ]),
                      }),
                    ]),
                  }),
                  $(FormColumn, {
                    children: addkeys([
                      $(FormRow, {
                        children: addkeys([
                          $(FormLabel, {label: 'MVP Male'}),
                          $(InputSelect, {
                            value: form.data.mvpMale,
                            valueSet: form.link('mvpMale'),
                            options: against.users.map((i) => ({
                              key: i.id,
                              label: `${i.firstName} ${i.lastName}`,
                            })),
                          }),
                        ]),
                      }),
                      $(FormRow, {
                        children: addkeys([
                          $(FormLabel, {label: 'MVP Female'}),
                          $(InputSelect, {
                            value: form.data.mvpFemale,
                            valueSet: form.link('mvpFemale'),
                            options: against.users.map((i) => ({
                              key: i.id,
                              label: `${i.firstName} ${i.lastName}`,
                            })),
                          }),
                        ]),
                      }),
                      $(FormHelp, {
                        children: `If you can't find the player you are looking for, please put their name in the spirit score comment section.`,
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
                    click: () => {
                      if (form.data.mvpMale === form.data.mvpFemale) {
                        const message =
                          'The male and female MVP can not be the same person.'
                        return toaster.error(message)
                      }
                      $create.fetch(form.data as any).then(done)
                    },
                  }),
                ]),
          }),
        ]),
      }),
    ]),
  })
}
