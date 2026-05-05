import {Poster} from '@browser/app/Poster'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {
  createElement as $,
  FC,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {$FeatureReportEditorLoad} from '../endpoints/Feature'
import {$ReportCreate} from '../endpoints/Report'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {
  createReportFormData,
  renderFixtureSelect,
  renderTeamSelect,
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
  const [teams, teamsSet] = useState<TTeam[]>()
  const [againstOptions, againstOptionsSet] =
    useState<Array<{team: TTeam; users: TUserPublic[]}>>()
  const $editorLoad = useEndpoint($FeatureReportEditorLoad)
  const $create = useEndpoint($ReportCreate)

  // Check if the season uses official scoring
  const useOfficialScoring = auth.season?.useOfficialScoring === true
  const canChooseTeam = auth.isAdmin()

  const form = useForm(
    createReportFormData({
      teamId: canChooseTeam ? undefined : auth.current?.team?.id,
    }),
  )

  useEffect(() => {
    if (
      canChooseTeam ||
      !auth.current?.team?.id ||
      form.data.teamId === auth.current.team.id
    ) {
      return
    }

    form.patch({teamId: auth.current.team.id})
  }, [auth.current?.team?.id, canChooseTeam, form.data.teamId])

  useEffect(() => {
    $editorLoad.fetch({seasonId: auth.season!.id}).then((data) => {
      fixturesSet(data.fixtures)
      teamsSet(data.teams)
    })
  }, [])

  useEffect(() => {
    if (!form.data.fixtureId || !form.data.teamId) {
      againstOptionsSet(undefined)
      return
    }

    let cancelled = false
    const currentAgainstTeamId = form.data.againstTeamId

    againstOptionsSet(undefined)

    $editorLoad
      .fetch({
        seasonId: auth.season!.id,
        fixtureId: form.data.fixtureId,
        teamId: form.data.teamId,
      })
      .then(
        ({
          fixtures: nextFixtures,
          teams: nextTeams,
          againstOptions: nextAgainstOptions,
        }) => {
          if (cancelled) return

          fixturesSet(nextFixtures)
          teamsSet(nextTeams)
          againstOptionsSet(nextAgainstOptions)
          const hasCurrentSelection = nextAgainstOptions.some(
            (option) => option.team.id === currentAgainstTeamId,
          )

          form.patch({
            againstTeamId:
              nextAgainstOptions.length === 1
                ? nextAgainstOptions[0].team.id
                : hasCurrentSelection
                  ? currentAgainstTeamId
                  : undefined,
          })
        },
      )

    return () => {
      cancelled = true
    }
  }, [form.data.fixtureId, form.data.teamId])

  const chosenAgainst = againstOptions?.find(
    (i) => i.team.id === form.data.againstTeamId,
  )
  const selectedTeam = teams?.find((team) => team.id === form.data.teamId)

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
    [chosenAgainst],
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
            fixtures,
          ),
          $(Fragment, {
            children:
              canChooseTeam &&
              teams &&
              renderTeamSelect(form.data.teamId, form.link('teamId'), teams),
          }),
          $(Fragment, {
            children:
              !form.data.fixtureId ||
              !form.data.teamId ||
              !selectedTeam ||
              !againstOptions
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
                      selectedTeam.name,
                      selectedTeam.color,
                      form.data.againstTeamId,
                      form.link('againstTeamId'),
                      againstOptions,
                    ),
                    renderScoreInputs(
                      form.data.scoreFor,
                      form.link('scoreFor'),
                      form.data.scoreAgainst,
                      form.link('scoreAgainst'),
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
                          form.link('mvpFemale2'),
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
                          form.link('spiritComment'),
                        )
                      : renderSpiritInputs(
                          form.data.spirit,
                          (value) => form.patch({spirit: value}),
                          form.data.spiritComment,
                          form.link('spiritComment'),
                        ),
                    renderSubmitButton($create.loading, handleSubmit),
                  ]),
          }),
        ]),
      }),
    ]),
  })
}
