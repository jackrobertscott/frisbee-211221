import {Poster} from '@browser/app/Poster'
import {css} from '@emotion/css'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import dayjs from 'dayjs'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FixtureListOfSeason} from '../endpoints/Fixture'
import {$ReportCreate, $ReportGetFixtureAgainst} from '../endpoints/Report'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {SPIRIT_OPTIONS} from '../utils/constants'
import {hsla} from '../utils/hsla'
import {initials} from '../utils/initials'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {FormColumn} from './Form/FormColumn'
import {FormHelp} from './Form/FormHelp'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {InputNumber} from './Input/InputNumber'
import {InputSelect} from './Input/InputSelect'
import {InputTextarea} from './Input/InputTextarea'
import {useMedia} from './Media/useMedia'
import {Modal} from './Modal'
import {Spinner} from './Spinner'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
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
  const media = useMedia()
  const toaster = useToaster()
  const isSmall = media.width < theme.fib[12]
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [againstOptions, againstOptionsSet] =
    useState<Array<{team: TTeam; users: TUserPublic[]}>>()
  const $fixtureList = useEndpoint($FixtureListOfSeason)
  const $fixtureAgainst = useEndpoint($ReportGetFixtureAgainst)
  const $create = useEndpoint($ReportCreate)
  const form = useForm({
    teamId: auth.current?.team?.id,
    againstTeamId: undefined as undefined | string,
    fixtureId: undefined as undefined | string,
    scoreFor: undefined as undefined | number,
    scoreAgainst: undefined as undefined | number,
    mvpMale: undefined as undefined | string,
    mvpFemale: undefined as undefined | string,
    spirit: undefined as undefined | number,
    spiritComment: '',
  })
  useEffect(() => {
    $fixtureList.fetch({seasonId: auth.season!.id}).then(fixturesSet)
  }, [])
  useEffect(() => {
    if (form.data.fixtureId && auth.current?.team) {
      $fixtureAgainst
        .fetch({fixtureId: form.data.fixtureId, teamId: auth.current?.team.id})
        .then((againstOptions) => againstOptionsSet(againstOptions))
    }
  }, [form.data.fixtureId])
  useEffect(() => {
    if (form.data.fixtureId && form.data.teamId) {
      $fixtureAgainst
        .fetch({fixtureId: form.data.fixtureId, teamId: form.data.teamId})
        .then((againstTeams) => {
          againstOptionsSet(againstTeams)
          if (againstTeams.length === 1) {
            form.patch({againstTeamId: againstTeams[0].team.id})
          }
        })
    }
  }, [form.data.fixtureId, form.data.teamId])
  const chosenAgainst = againstOptions?.find(
    (i) => i.team.id === form.data.againstTeamId
  )
  const shuffledUsers = shuffleArray(chosenAgainst?.users ?? [])
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
                    value: form.data.fixtureId,
                    valueSet: form.link('fixtureId'),
                    options: fixtures.map((i) => ({
                      key: i.id,
                      label: `${i.title} - ${dayjs(i.date).format('DD/MM/YY')}`,
                    })),
                  }),
                ]),
              }),
          $(Fragment, {
            children:
              !form.data.fixtureId || !auth.current?.team || !againstOptions
                ? $(FormColumn, {
                    children: $(Poster, {
                      icon: 'edit',
                      title: 'Submit A Report',
                      description:
                        'Score reports include the game score, MVPs, and spirit.',
                    }),
                  })
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
                          $(InputSelect, {
                            value: form.data.againstTeamId,
                            valueSet: form.link('againstTeamId'),
                            options: againstOptions.map((i) => ({
                              key: i.team.id,
                              label: i.team.name,
                              color: i.team.color,
                            })),
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
                            $(FormLabel, {label: 'Opposition Score'}),
                            $(InputNumber, {
                              value: form.data.scoreAgainst,
                              valueSet: form.link('scoreAgainst'),
                            }),
                          ]),
                        }),
                      ]),
                    }),
                    $(Fragment, {
                      children:
                        chosenAgainst &&
                        $(FormColumn, {
                          children: addkeys([
                            $(FormRow, {
                              children: addkeys([
                                $(FormLabel, {label: 'MVP Male'}),
                                $(InputSelect, {
                                  value: form.data.mvpMale,
                                  valueSet: form.link('mvpMale'),
                                  options: shuffledUsers.map((i) => ({
                                    key: i.id,
                                    label: `${i.firstName} ${i.lastName}`,
                                  })),
                                }),
                                $(FormBadge, {
                                  icon: 'times',
                                  click: () => form.patch({mvpMale: undefined}),
                                }),
                              ]),
                            }),
                            $(FormRow, {
                              children: addkeys([
                                $(FormLabel, {label: 'MVP Female'}),
                                $(InputSelect, {
                                  value: form.data.mvpFemale,
                                  valueSet: form.link('mvpFemale'),
                                  options: shuffledUsers.map((i) => ({
                                    key: i.id,
                                    label: `${i.firstName} ${i.lastName}`,
                                  })),
                                }),
                                $(FormBadge, {
                                  icon: 'times',
                                  click: () =>
                                    form.patch({mvpFemale: undefined}),
                                }),
                              ]),
                            }),
                          ]),
                        }),
                    }),
                    $(FormColumn, {
                      children: addkeys([
                        $(FormRow, {
                          children: addkeys([
                            $(FormLabel, {label: 'Spirit Score'}),
                            $(InputSelect, {
                              value: form.data.spirit?.toString(),
                              valueSet: (i) => form.patch({spirit: +i}),
                              placeholder: 'Select...',
                              options: SPIRIT_OPTIONS,
                            }),
                          ]),
                        }),
                        $(FormRow, {
                          children: addkeys([
                            $(InputTextarea, {
                              rows: 2,
                              value: form.data.spiritComment,
                              valueSet: form.link('spiritComment'),
                              placeholder: 'Write a comment... (optional)',
                            }),
                          ]),
                        }),
                        $(FormHelp, {
                          children: addkeys([
                            'See ',
                            $('a', {
                              href: 'https://d36m266ykvepgv.cloudfront.net/uploads/media/aTYVA2eazu/o/sotg-scoring-system-template-2019.pdf',
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
                        if (
                          form.data.mvpMale &&
                          form.data.mvpMale === form.data.mvpFemale
                        ) {
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

function shuffleArray(array: any[]): any[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}
