import {Poster} from '@browser/app/Poster'
import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
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
  createReportCreatePayload,
  createReportFormDataFromReport,
  ReportAgainstOption,
  ReportFormData,
  renderAgainstTeamSelect,
  renderFixtureSelect,
  renderMVPInputs,
  renderOfficialSpiritInputs,
  renderScoreInputs,
  renderSpiritInputs,
  renderSubmitButton,
  renderTeamHeader,
  renderTeamSelect,
  sanitizeReportFormMvps,
  shuffleArray,
  validateReportForm,
} from '../utils/renderReportForm'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {Modal} from './Modal'
import {Spinner} from './Spinner'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'
import {useForm} from './useForm'

function getLatestPastFixtureId(fixtures: TFixture[] | undefined) {
  if (!fixtures?.length) {
    return undefined
  }

  const now = Date.now()
  let fixtureId: string | undefined
  let fixtureTime = -Infinity

  for (const fixture of fixtures) {
    const nextFixtureTime = new Date(fixture.date).valueOf()
    if (!Number.isFinite(nextFixtureTime) || nextFixtureTime > now) {
      continue
    }
    if (nextFixtureTime >= fixtureTime) {
      fixtureTime = nextFixtureTime
      fixtureId = fixture.id
    }
  }

  return fixtureId
}

export const ReportModal: FC<{
  title: string
  close: () => void
  onSubmit: (data: ReportFormData) => void
  loading?: boolean
  options?: {label: string; click: () => void}[]
  initialData?: Partial<TReport>
  initialFixtures?: TFixture[]
  initialTeams?: TTeam[]
  submitter?: string
  variant: 'public' | 'dashboard'
}> = ({
  title,
  close,
  onSubmit,
  loading,
  options,
  initialData,
  initialFixtures,
  initialTeams,
  submitter,
  variant,
}) => {
  const auth = useAuth()
  const toaster = useToaster()
  const $reportEditorLoad = useEndpoint($FeatureReportEditorLoad)
  const [fixtures, fixturesSet] = useState(initialFixtures)
  const [teams, teamsSet] = useState(initialTeams)
  const [againstOptions, againstOptionsSet] = useState<ReportAgainstOption[]>()

  const isDashboard = variant === 'dashboard'
  const isEditing = !!initialData?.id
  const useOfficialScoring = auth.season?.useOfficialScoring === true
  const canChooseTeam = isDashboard || auth.isAdmin()
  const preferredTeamId = auth.current?.team?.id
  const defaultFixtureId = getLatestPastFixtureId(fixtures)

  const form = useForm(
    createReportFormDataFromReport(initialData ?? {teamId: preferredTeamId}),
  )

  useEffect(() => {
    if (initialFixtures !== undefined) {
      fixturesSet(initialFixtures)
    }
  }, [initialFixtures])

  useEffect(() => {
    if (initialTeams !== undefined) {
      teamsSet(initialTeams)
    }
  }, [initialTeams])

  useEffect(() => {
    againstOptionsSet(undefined)
    form.set(
      createReportFormDataFromReport(initialData ?? {teamId: preferredTeamId}),
    )
  }, [initialData?.id])

  useEffect(() => {
    if (initialFixtures !== undefined && initialTeams !== undefined) {
      return
    }

    $reportEditorLoad.fetch({seasonId: auth.season!.id}).then((data) => {
      fixturesSet(data.fixtures)
      teamsSet(data.teams)
    })
  }, [auth.season?.id, initialFixtures, initialTeams])

  useEffect(() => {
    if (isEditing || !preferredTeamId || form.data.teamId === preferredTeamId) {
      return
    }

    if (!canChooseTeam || !form.data.teamId) {
      form.patch({teamId: preferredTeamId})
    }
  }, [canChooseTeam, form.data.teamId, isEditing, preferredTeamId])

  useEffect(() => {
    if (isEditing || form.data.fixtureId || !defaultFixtureId) {
      return
    }

    form.patch({fixtureId: defaultFixtureId})
  }, [defaultFixtureId, form.data.fixtureId, isEditing])

  useEffect(() => {
    if (!form.data.fixtureId || !form.data.teamId) {
      againstOptionsSet(undefined)
      return
    }

    let cancelled = false
    const currentAgainstTeamId = form.data.againstTeamId

    againstOptionsSet(undefined)

    $reportEditorLoad
      .fetch({
        seasonId: auth.season!.id,
        fixtureId: form.data.fixtureId,
        teamId: form.data.teamId,
      })
      .then(({fixtures: nextFixtures, teams: nextTeams, againstOptions}) => {
        if (cancelled) {
          return
        }

        fixturesSet(nextFixtures)
        teamsSet(nextTeams)
        againstOptionsSet(againstOptions)
        const hasCurrentSelection = againstOptions.some(
          (option) => option.team.id === currentAgainstTeamId,
        )

        form.patch({
          againstTeamId:
            againstOptions.length === 1
              ? againstOptions[0].team.id
              : hasCurrentSelection
                ? currentAgainstTeamId
                : undefined,
        })
      })

    return () => {
      cancelled = true
    }
  }, [auth.season?.id, form.data.fixtureId, form.data.teamId])

  const chosenAgainst = againstOptions?.find(
    (option) => option.team.id === form.data.againstTeamId,
  )
  const selectedTeam = teams?.find((team) => team.id === form.data.teamId)

  useEffect(() => {
    const nextMvps = sanitizeReportFormMvps(
      form.data,
      chosenAgainst?.users,
      auth.season,
    )

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
    form.data.mvpFemale,
    form.data.mvpFemale2,
    form.data.mvpMale,
    form.data.mvpMale2,
    auth.season?.genderDivision,
  ])

  const shuffledUsers = useMemo(
    () => shuffleArray(chosenAgainst?.users ?? []),
    [chosenAgainst],
  )

  const handleSubmit = () => {
    const errorMessage = validateReportForm(
      form.data,
      useOfficialScoring,
      auth.season,
    )
    if (errorMessage) {
      return toaster.error(errorMessage)
    }
    onSubmit(form.data)
  }

  const coreFields =
    againstOptions &&
    addkeys([
      renderScoreInputs(
        form.data.scoreFor,
        form.link('scoreFor'),
        form.data.scoreAgainst,
        form.link('scoreAgainst'),
        isDashboard,
      ),
      $(Fragment, {
        children:
          chosenAgainst &&
          renderMVPInputs(
            form.data.mvpMale,
            form.link('mvpMale'),
            form.data.mvpFemale,
            form.link('mvpFemale'),
            isDashboard ? chosenAgainst.users : shuffledUsers,
            useOfficialScoring,
            form.data.mvpMale2,
            form.link('mvpMale2'),
            form.data.mvpFemale2,
            form.link('mvpFemale2'),
            auth.season,
          ),
      }),
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
      renderSubmitButton(loading, handleSubmit),
    ])

  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: title,
          }),
          $(Fragment, {
            children: options?.map((option) =>
              $(TopBarBadge, {
                key: option.label,
                label: option.label,
                click: option.click,
              }),
            ),
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
          submitter &&
            $(FormRow, {
              children: addkeys([
                $(FormLabel, {label: 'Submitted by'}),
                $(FormLabel, {
                  label: submitter,
                  background: theme.bgDisabled,
                  grow: true,
                }),
              ]),
            }),
          renderFixtureSelect(
            form.data.fixtureId,
            form.link('fixtureId'),
            fixtures,
            isDashboard && !!initialData?.fixtureId,
          ),
          isDashboard
            ? $(FormColumn, {
                children: addkeys([
                  teams &&
                    renderTeamSelect(
                      form.data.teamId,
                      form.link('teamId'),
                      teams,
                      !!initialData?.teamId,
                    ),
                  againstOptions &&
                    renderAgainstTeamSelect(
                      form.data.againstTeamId,
                      form.link('againstTeamId'),
                      againstOptions,
                      !!initialData?.teamAgainstId,
                    ),
                ]),
              })
            : $(Fragment, {
                children:
                  canChooseTeam &&
                  teams &&
                  renderTeamSelect(form.data.teamId, form.link('teamId'), teams),
              }),
          isDashboard
            ? $(Fragment, {
                children:
                  !againstOptions &&
                  form.data.teamId &&
                  form.data.fixtureId &&
                  $(Spinner),
              })
            : $(Fragment, {
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
                        $(Fragment, {
                          children: coreFields,
                        }),
                      ]),
              }),
          isDashboard &&
            $(Fragment, {
              children: coreFields,
            }),
        ]),
      }),
    ]),
  })
}

export const ReportCreate: FC<{
  close: () => void
  done: () => void
}> = ({close, done}) => {
  const auth = useAuth()
  const $create = useEndpoint($ReportCreate)

  return $(ReportModal, {
    title: 'Report Score',
    close,
    loading: $create.loading,
    variant: 'public',
    onSubmit: (data) => {
      const payload = createReportCreatePayload(data, auth.season)
      if (!payload) {
        return
      }
      $create.fetch(payload).then(done)
    },
  })
}
