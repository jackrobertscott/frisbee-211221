import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import dayjs from 'dayjs'
import {createElement as $} from 'react'
import {FormBadge} from '../app/Form/FormBadge'
import {FormColumn} from '../app/Form/FormColumn'
import {FormHelp} from '../app/Form/FormHelp'
import {FormLabel} from '../app/Form/FormLabel'
import {FormRow} from '../app/Form/FormRow'
import {InputNumber} from '../app/Input/InputNumber'
import {InputSelect} from '../app/Input/InputSelect'
import {InputTextarea} from '../app/Input/InputTextarea'
import {Spinner} from '../app/Spinner'
import {addkeys} from './addkeys'
import {SPIRIT_OPTIONS} from './constants'
import {hsla} from './hsla'
import {initials} from './initials'

// Common type for form data
export type ReportFormData = {
  teamId: undefined | string
  againstTeamId: undefined | string
  fixtureId: undefined | string
  scoreFor: undefined | number
  scoreAgainst: undefined | number
  mvpMale: undefined | string
  mvpFemale: undefined | string
  spirit: undefined | number
  spiritComment: string
}

/**
 * Renders fixture selection input
 */
export function renderFixtureSelect(
  fixtureId: string | undefined,
  setFixtureId: (value: string) => void,
  fixtures: TFixture[] | undefined
) {
  if (fixtures === undefined) {
    return $(Spinner)
  }

  return $(FormRow, {
    children: addkeys([
      $(FormLabel, {label: 'Fixture'}),
      $(InputSelect, {
        value: fixtureId,
        valueSet: setFixtureId,
        options: fixtures.map((i) => ({
          key: i.id,
          label: `${i.title} - ${dayjs(i.date).format('DD/MM/YY')}`,
        })),
      }),
    ]),
  })
}

/**
 * Renders team select input for the reporting team
 */
export function renderTeamSelect(
  teamId: string | undefined,
  setTeamId: (value: string) => void,
  teams: TTeam[],
  disabled: boolean = false
) {
  return $(FormRow, {
    children: addkeys([
      $(FormLabel, {label: 'For'}),
      $(InputSelect, {
        disabled,
        value: teamId,
        valueSet: setTeamId,
        options: teams.map((i) => ({
          key: i.id,
          label: i.name,
          color: i.color,
        })),
      }),
    ]),
  })
}

/**
 * Renders against team select input
 */
export function renderAgainstTeamSelect(
  againstTeamId: string | undefined,
  setAgainstTeamId: (value: string) => void,
  againstOptions: Array<{team: TTeam; users: TUserPublic[]}>,
  disabled: boolean = false
) {
  return $(FormRow, {
    children: addkeys([
      $(FormLabel, {label: 'Against'}),
      $(InputSelect, {
        disabled,
        value: againstTeamId,
        valueSet: setAgainstTeamId,
        options: againstOptions.map((i) => ({
          key: i.team.id,
          label: i.team.name,
          color: i.team.color,
        })),
      }),
    ]),
  })
}

/**
 * Renders team header with team vs opponent badges
 */
export function renderTeamHeader(
  teamId: string | undefined,
  teamName: string | undefined,
  teamColor: string | undefined,
  againstTeamId: string | undefined,
  setAgainstTeamId: (value: string) => void,
  againstOptions: Array<{team: TTeam; users: TUserPublic[]}> | undefined,
  isSmall: boolean = false
) {
  if (!teamId || !againstOptions) return null

  return $('div', {
    style: {textAlign: 'center'},
    children: $(FormRow, {
      children: addkeys([
        $(FormBadge, {
          grow: true,
          label: isSmall ? initials(teamName || '') : teamName,
          background: hsla.digest(teamColor || ''),
          font: hsla.digest(teamColor || '').compliment(),
        }),
        $(FormBadge, {
          label: 'vs',
        }),
        $(InputSelect, {
          value: againstTeamId,
          valueSet: setAgainstTeamId,
          options: againstOptions.map((i) => ({
            key: i.team.id,
            label: i.team.name,
            color: i.team.color,
          })),
        }),
      ]),
    }),
  })
}

/**
 * Renders score inputs
 */
export function renderScoreInputs(
  scoreFor: number | undefined,
  setScoreFor: (value: number | undefined) => void,
  scoreAgainst: number | undefined,
  setScoreAgainst: (value: number | undefined) => void,
  adminVersion?: boolean
) {
  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: adminVersion ? 'For Score' : 'Your Score'}),
          $(InputNumber, {
            value: scoreFor,
            valueSet: setScoreFor,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            label: adminVersion ? 'Against Score' : 'Opposition Score',
          }),
          $(InputNumber, {
            value: scoreAgainst,
            valueSet: setScoreAgainst,
          }),
        ]),
      }),
    ]),
  })
}

/**
 * Renders MVP selection inputs
 */
export function renderMVPInputs(
  mvpMale: string | undefined,
  setMvpMale: (value: string | undefined) => void,
  mvpFemale: string | undefined,
  setMvpFemale: (value: string | undefined) => void,
  users: TUserPublic[]
) {
  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'MVP Male'}),
          $(InputSelect, {
            value: mvpMale,
            valueSet: setMvpMale,
            options: users.map((i) => ({
              key: i.id,
              label: `${i.firstName} ${i.lastName}`,
            })),
          }),
          $(FormBadge, {
            icon: 'times',
            click: () => setMvpMale(undefined),
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'MVP Female'}),
          $(InputSelect, {
            value: mvpFemale,
            valueSet: setMvpFemale,
            options: users.map((i) => ({
              key: i.id,
              label: `${i.firstName} ${i.lastName}`,
            })),
          }),
          $(FormBadge, {
            icon: 'times',
            click: () => setMvpFemale(undefined),
          }),
        ]),
      }),
    ]),
  })
}

/**
 * Renders spirit score and comment inputs
 */
export function renderSpiritInputs(
  spirit: number | undefined,
  setSpirit: (value: number) => void,
  spiritComment: string,
  setSpiritComment: (value: string) => void
) {
  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {label: 'Spirit Score'}),
          $(InputSelect, {
            value: spirit?.toString(),
            valueSet: (i) => setSpirit(+i),
            placeholder: 'Select...',
            options: SPIRIT_OPTIONS,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(InputTextarea, {
            rows: 2,
            value: spiritComment,
            valueSet: setSpiritComment,
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
  })
}

/**
 * Renders submit button
 */
export function renderSubmitButton(
  loading: boolean = false,
  onClick: () => void
) {
  return $(FormBadge, {
    disabled: loading,
    label: loading ? 'Loading' : 'Submit',
    click: onClick,
  })
}

/**
 * Validates if a report form can be submitted
 * Returns error message if invalid, undefined if valid
 */
export function validateReportForm(
  formData: ReportFormData
): string | undefined {
  if (formData.mvpMale && formData.mvpMale === formData.mvpFemale) {
    return 'The male and female MVP cannot be the same person.'
  }
  return undefined
}

/**
 * Shuffles an array in-place using the Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array] // Create a copy to avoid modifying the original
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}
