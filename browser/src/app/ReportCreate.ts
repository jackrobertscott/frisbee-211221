import {Poster} from '@browser/app/Poster'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {$FixtureListOfSeason} from '../endpoints/Fixture'
import {$ReportCreate, $ReportGetFixtureAgainst} from '../endpoints/Report'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {
  renderFixtureSelect,
  renderMVPInputs,
  renderOfficialSpiritInputs,
  renderScoreInputs,
  renderSpiritInputs,
  renderSubmitButton,
  renderTeamHeader,
  shuffleArray,
  validateReportForm,
} from '../utils/renderReportForm'
import {useAuth} from './Auth/useAuth'
import {Form} from './Form/Form'
import {FormColumn} from './Form/FormColumn'
import {useMedia} from './Media/useMedia'
import {Modal} from './Modal'
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

  // Check if the season uses official scoring
  const useOfficialScoring = auth.season?.useOfficialScoring === true

  // Initialize the form with fields based on scoring type
  const form = useForm({
    teamId: auth.current?.team?.id,
    againstTeamId: undefined as undefined | string,
    fixtureId: undefined as undefined | string,
    scoreFor: undefined as undefined | number,
    scoreAgainst: undefined as undefined | number,
    mvpMale: undefined as undefined | string,
    mvpFemale: undefined as undefined | string,
    mvpMale2: undefined as undefined | string,
    mvpFemale2: undefined as undefined | string,
    spiritP1: undefined as undefined | number,
    spiritP2: undefined as undefined | number,
    spiritP3: undefined as undefined | number,
    spiritP4: undefined as undefined | number,
    spiritP5: undefined as undefined | number,
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
                          icon: 'loading',
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
                      againstOptions,
                      isSmall
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
