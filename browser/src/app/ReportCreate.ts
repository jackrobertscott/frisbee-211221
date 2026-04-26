import {Poster} from '@browser/app/Poster'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {createElement as $, FC, Fragment, useEffect, useMemo, useState} from 'react'
import {$FixtureListOfSeason} from '../endpoints/Fixture'
import {$ReportCreate, $ReportGetFixtureAgainst} from '../endpoints/Report'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {
  createReportFormData,
  renderFixtureSelect,
  renderMVPInputs,
  renderOfficialSpiritInputs,
  renderScoreInputs,
  renderSpiritInputs,
  renderSubmitButton,
  renderTeamHeader,
  sanitizeReportFormMvps,
  shuffleArray,
  validateReportForm,
} from '../utils/renderReportForm'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {Modal} from './Modal'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'

export const ReportCreate: FC<{
  close: () => void
  done: () => void
}> = ({close, done}) => {
  const auth = useAuth()
  // const media = useMedia()
  const toaster = useToaster()
  // const isSmall = media.width < theme.fib[12]
  const [fixtures, fixturesSet] = useState<TFixture[]>()
  const [againstOptions, againstOptionsSet] =
    useState<Array<{team: TTeam; users: TUserPublic[]}>>()
  const $fixtureList = useEndpoint($FixtureListOfSeason)
  const $fixtureAgainst = useEndpoint($ReportGetFixtureAgainst)
  const $create = useEndpoint($ReportCreate)

  // Check if the season uses official scoring
  const useOfficialScoring = auth.season?.useOfficialScoring === true

  const form = useForm(
    createReportFormData({
      teamId: auth.current?.team?.id,
    })
  )

  useEffect(() => {
    if (!auth.current?.team?.id || form.data.teamId === auth.current.team.id) {
      return
    }

    form.patch({teamId: auth.current.team.id})
  }, [auth.current?.team?.id, form.data.teamId])

  useEffect(() => {
    $fixtureList.fetch({seasonId: auth.season!.id}).then(fixturesSet)
  }, [])

  useEffect(() => {
    if (!form.data.fixtureId || !form.data.teamId) {
      againstOptionsSet(undefined)
      return
    }

    let cancelled = false
    const currentAgainstTeamId = form.data.againstTeamId

    againstOptionsSet(undefined)

    $fixtureAgainst
      .fetch({fixtureId: form.data.fixtureId, teamId: form.data.teamId})
      .then((nextAgainstOptions) => {
        if (cancelled) return

        againstOptionsSet(nextAgainstOptions)
        const hasCurrentSelection = nextAgainstOptions.some(
          (option) => option.team.id === currentAgainstTeamId
        )

        form.patch({
          againstTeamId:
            nextAgainstOptions.length === 1
              ? nextAgainstOptions[0].team.id
              : hasCurrentSelection
              ? currentAgainstTeamId
              : undefined,
        })
      })

    return () => {
      cancelled = true
    }
  }, [form.data.fixtureId, form.data.teamId])

  const chosenAgainst = againstOptions?.find(
    (i) => i.team.id === form.data.againstTeamId
  )

  useEffect(() => {
    const nextMvps = sanitizeReportFormMvps(form.data, chosenAgainst?.users)

    if (
      nextMvps.mvpMale === form.data.mvpMale &&
      nextMvps.mvpFemale === form.data.mvpFemale &&
      nextMvps.mvpMale2 === form.data.mvpMale2 &&
      nextMvps.mvpFemale2 === form.data.mvpFemale2
    ) {
      return
    }

    form.patch(nextMvps)
  }, [
    chosenAgainst,
    form.data.mvpMale,
    form.data.mvpFemale,
    form.data.mvpMale2,
    form.data.mvpFemale2,
  ])

  const shuffledUsers = useMemo(
    () => shuffleArray(chosenAgainst?.users ?? []),
    [chosenAgainst]
  )

  const handleSubmit = () => {
    const errorMessage = validateReportForm(form.data, useOfficialScoring)
    if (errorMessage) {
      return toaster.error(errorMessage)
    }
    $create.fetch(form.data as any).then(done)
  }

  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Report Score',
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
          renderFixtureSelect(
            form.data.fixtureId,
            form.link('fixtureId'),
            fixtures
          ),
          $(Fragment, {
            children:
              !form.data.fixtureId || !auth.current?.team || !againstOptions
                ? $(FormColumn, {
                    children: form.data.fixtureId
                      ? $(Poster, {
                          icon: 'spinner',
                          title: 'Loading',
                          description: 'Loading teams and players...',
                        })
                      : $(Poster, {
                          icon: 'edit',
                          title: 'Submit A Report',
                          description:
                            'Score reports include the game score, MVPs, and spirit.',
                        }),
                  })
                : addkeys([
                    renderTeamHeader(
                      form.data.teamId,
                      auth.current.team.name,
                      auth.current.team.color,
                      form.data.againstTeamId,
                      form.link('againstTeamId'),
                      againstOptions
                    ),
                    renderScoreInputs(
                      form.data.scoreFor,
                      form.link('scoreFor'),
                      form.data.scoreAgainst,
                      form.link('scoreAgainst')
                    ),
                    $(Fragment, {
                      children:
                        chosenAgainst &&
                        renderMVPInputs(
                          form.data.mvpMale,
                          form.link('mvpMale'),
                          form.data.mvpFemale,
                          form.link('mvpFemale'),
                          shuffledUsers,
                          useOfficialScoring,
                          form.data.mvpMale2,
                          form.link('mvpMale2'),
                          form.data.mvpFemale2,
                          form.link('mvpFemale2')
                        ),
                    }),
                    // Render either official or standard spirit inputs based on the season setting
                    useOfficialScoring
                      ? renderOfficialSpiritInputs(
                          form.data.spiritP1,
                          (value) => form.patch({spiritP1: value}),
                          form.data.spiritP2,
                          (value) => form.patch({spiritP2: value}),
                          form.data.spiritP3,
                          (value) => form.patch({spiritP3: value}),
                          form.data.spiritP4,
                          (value) => form.patch({spiritP4: value}),
                          form.data.spiritP5,
                          (value) => form.patch({spiritP5: value}),
                          form.data.spiritComment,
                          form.link('spiritComment')
                        )
                      : renderSpiritInputs(
                          form.data.spirit,
                          (value) => form.patch({spirit: value}),
                          form.data.spiritComment,
                          form.link('spiritComment')
                        ),
                    renderSubmitButton($create.loading, handleSubmit),
                  ]),
          }),
        ]),
      }),
    ]),
  })
}
