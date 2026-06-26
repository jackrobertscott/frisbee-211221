import {theme} from '@browser/theme'
import {
  TReportCreatePayload,
  TReportUpdatePayload,
} from '@shared/endpoints/ReportDef'
import {exactShape} from '@shared/utils/endpointDef'
import type {CSSObject} from '@emotion/css/dist/declarations/src/create-instance'
import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {validateOfficialSpiritComment} from '@shared/utils/reportValidation'
import {
  getSeasonMvpSlots,
  isReportMvpCompleteForSeason,
  isSeasonMvpSlotEnabled,
  isUserEligibleForMvpSlot,
  sanitizeSeasonMvpFields,
} from '@shared/utils/seasonGenderDivision'
import dayjs from 'dayjs'
import {createElement as $} from 'react'
import {FormBadge} from '../app/Form/FormBadge'
import {FormColumn} from '../app/Form/FormColumn'
import {FormHelp} from '../app/Form/FormHelp'
import {FormLabel} from '../app/Form/FormLabel'
import {FormRow} from '../app/Form/FormRow'
import {InputNumber} from '../app/Input/InputNumber'
import {InputSelect, TSelectOption} from '../app/Input/InputSelect'
import {InputTextarea} from '../app/Input/InputTextarea'
import {Spinner} from '../app/Spinner'
import {addkeys} from './addkeys'
import {
  SPIRIT_CATEGORY_DESCRIPTIONS,
  SPIRIT_CATEGORY_OPTIONS,
  SPIRIT_DEFAULT_SCORE,
  SPIRIT_OPTIONS,
} from './constants'
import {hsla} from './hsla'

export type ReportFormData = {
  teamId: undefined | string
  againstTeamId: undefined | string
  fixtureId: undefined | string
  scoreFor: undefined | number
  scoreAgainst: undefined | number
  mvpMale: undefined | string
  mvpFemale: undefined | string
  mvpMale2?: undefined | string
  mvpFemale2?: undefined | string
  spirit: undefined | number
  spiritComment: string
  spiritP1?: undefined | number
  spiritP2?: undefined | number
  spiritP3?: undefined | number
  spiritP4?: undefined | number
  spiritP5?: undefined | number
}

export type ReportAgainstOption = {team: TTeam; users: TUserPublic[]}
type MvpSlot = 'male' | 'female'
type ReportMvpField = 'mvpMale' | 'mvpFemale' | 'mvpMale2' | 'mvpFemale2'

const REPORT_FORM_DEFAULTS: ReportFormData = {
  teamId: undefined,
  againstTeamId: undefined,
  fixtureId: undefined,
  scoreFor: undefined,
  scoreAgainst: undefined,
  mvpMale: undefined,
  mvpFemale: undefined,
  mvpMale2: undefined,
  mvpFemale2: undefined,
  spirit: SPIRIT_DEFAULT_SCORE,
  spiritComment: '',
  spiritP1: SPIRIT_DEFAULT_SCORE,
  spiritP2: SPIRIT_DEFAULT_SCORE,
  spiritP3: SPIRIT_DEFAULT_SCORE,
  spiritP4: SPIRIT_DEFAULT_SCORE,
  spiritP5: SPIRIT_DEFAULT_SCORE,
}

const MVP_ROW_BP = theme.fib[12] - theme.fib[7]
const MVP_LABEL_WIDTH = 140
const SCORE_LABEL_BP = theme.fib[12]
const SCORE_LABEL_WIDTH = theme.fib[10]
const SCORE_LABEL_STYLE: CSSObject = {
  [theme.ltMedia(SCORE_LABEL_BP)]: {
    width: 'auto',
  },
}
const SPIRIT_LABEL_WIDTH = 220

export const createReportFormData = (
  overrides: Partial<ReportFormData> = {},
): ReportFormData => ({
  ...REPORT_FORM_DEFAULTS,
  ...overrides,
})

export const createReportFormDataFromReport = (
  report?: Partial<TReport>,
): ReportFormData =>
  createReportFormData({
    teamId: report?.teamId,
    againstTeamId: report?.teamAgainstId,
    fixtureId: report?.fixtureId,
    scoreFor: report?.scoreFor,
    scoreAgainst: report?.scoreAgainst,
    mvpMale: report?.mvpMale,
    mvpFemale: report?.mvpFemale,
    mvpMale2: report?.mvpMale2,
    mvpFemale2: report?.mvpFemale2,
    spirit: report?.spirit ?? SPIRIT_DEFAULT_SCORE,
    spiritComment: report?.spiritComment ?? '',
    spiritP1: report?.spiritP1 ?? SPIRIT_DEFAULT_SCORE,
    spiritP2: report?.spiritP2 ?? SPIRIT_DEFAULT_SCORE,
    spiritP3: report?.spiritP3 ?? SPIRIT_DEFAULT_SCORE,
    spiritP4: report?.spiritP4 ?? SPIRIT_DEFAULT_SCORE,
    spiritP5: report?.spiritP5 ?? SPIRIT_DEFAULT_SCORE,
  })

function getRequiredCreateFields(formData: ReportFormData) {
  if (
    !formData.teamId ||
    !formData.againstTeamId ||
    !formData.fixtureId ||
    formData.scoreFor === undefined ||
    formData.scoreAgainst === undefined
  ) {
    return undefined
  }

  return {
    teamId: formData.teamId,
    againstTeamId: formData.againstTeamId,
    fixtureId: formData.fixtureId,
    scoreFor: formData.scoreFor,
    scoreAgainst: formData.scoreAgainst,
  }
}

function getRequiredUpdateFields(formData: ReportFormData) {
  if (formData.scoreFor === undefined || formData.scoreAgainst === undefined) {
    return undefined
  }

  return {
    scoreFor: formData.scoreFor,
    scoreAgainst: formData.scoreAgainst,
  }
}

export function createReportCreatePayload(
  formData: ReportFormData,
  season?: TSeason,
): TReportCreatePayload | undefined {
  const required = getRequiredCreateFields(formData)
  if (!required) {
    return undefined
  }
  const mvps = sanitizeSeasonMvpFields(season, formData)

  return exactShape<TReportCreatePayload>()({
    teamId: required.teamId,
    teamAgainstId: required.againstTeamId,
    fixtureId: required.fixtureId,
    scoreFor: required.scoreFor,
    scoreAgainst: required.scoreAgainst,
    mvpMale: mvps.mvpMale,
    mvpFemale: mvps.mvpFemale,
    mvpMale2: mvps.mvpMale2,
    mvpFemale2: mvps.mvpFemale2,
    spirit: formData.spirit,
    spiritComment: formData.spiritComment,
    spiritP1: formData.spiritP1,
    spiritP2: formData.spiritP2,
    spiritP3: formData.spiritP3,
    spiritP4: formData.spiritP4,
    spiritP5: formData.spiritP5,
  })
}

export function createReportUpdatePayload(
  reportId: string,
  formData: ReportFormData,
  season?: TSeason,
): TReportUpdatePayload | undefined {
  const required = getRequiredUpdateFields(formData)
  if (!required) {
    return undefined
  }
  const mvps = sanitizeSeasonMvpFields(season, formData)

  return exactShape<TReportUpdatePayload>()({
    reportId,
    ...required,
    mvpMale: mvps.mvpMale,
    mvpFemale: mvps.mvpFemale,
    mvpMale2: mvps.mvpMale2,
    mvpFemale2: mvps.mvpFemale2,
    spirit: formData.spirit,
    spiritComment: formData.spiritComment,
    spiritP1: formData.spiritP1,
    spiritP2: formData.spiritP2,
    spiritP3: formData.spiritP3,
    spiritP4: formData.spiritP4,
    spiritP5: formData.spiritP5,
  })
}

export function sanitizeReportFormMvps(
  formData: Pick<ReportFormData, ReportMvpField>,
  users: TUserPublic[] | undefined,
  season?: TSeason,
): Pick<ReportFormData, ReportMvpField> {
  if (users === undefined) {
    const mvps = sanitizeSeasonMvpFields(season, formData)
    return {
      mvpMale: mvps.mvpMale,
      mvpFemale: mvps.mvpFemale,
      mvpMale2: mvps.mvpMale2,
      mvpFemale2: mvps.mvpFemale2,
    }
  }

  const slots = getSeasonMvpSlots(season)
  const usersById = new Map(users?.map((user) => [user.id, user]) ?? [])
  const getValidUserId = (
    field: ReportMvpField,
    userId: string | undefined,
  ) => {
    if (!userId) {
      return undefined
    }

    const user = usersById.get(userId)
    if (!user) {
      return undefined
    }

    const slot = field === 'mvpMale' || field === 'mvpMale2' ? 'male' : 'female'
    if (!isSeasonMvpSlotEnabled(season, slot)) {
      return undefined
    }
    return isUserEligibleForMvpSlot(user, slot) ? userId : undefined
  }

  const nextMvps = {
    mvpMale: slots.male ? getValidUserId('mvpMale', formData.mvpMale) : undefined,
    mvpFemale: slots.female
      ? getValidUserId('mvpFemale', formData.mvpFemale)
      : undefined,
    mvpMale2: slots.male
      ? getValidUserId('mvpMale2', formData.mvpMale2)
      : undefined,
    mvpFemale2: slots.female
      ? getValidUserId('mvpFemale2', formData.mvpFemale2)
      : undefined,
  }

  if (nextMvps.mvpMale && nextMvps.mvpMale === nextMvps.mvpMale2) {
    nextMvps.mvpMale2 = undefined
  }

  if (nextMvps.mvpFemale && nextMvps.mvpFemale === nextMvps.mvpFemale2) {
    nextMvps.mvpFemale2 = undefined
  }

  return nextMvps
}

function formatFixtureOptions(fixtures: TFixture[]): TSelectOption[] {
  return fixtures.map((fixture) => ({
    key: fixture.id,
    label: `${fixture.title} - ${dayjs(fixture.date).format('DD/MM/YY')}`,
  }))
}

function formatTeamOptions(teams: TTeam[]): TSelectOption[] {
  return teams.map((team) => ({
    key: team.id,
    label: team.name,
    color: team.color,
  }))
}

function formatAgainstOptions(
  againstOptions: ReportAgainstOption[],
): TSelectOption[] {
  return againstOptions.map(({team}) => ({
    key: team.id,
    label: team.name,
    color: team.color,
  }))
}

function formatUserOptions(
  users: TUserPublic[],
  slot: MvpSlot,
  excludedUserId?: string,
): TSelectOption[] {
  return users
    .filter((user) => isUserEligibleForMvpSlot(user, slot))
    .filter((user) => user.id !== excludedUserId)
    .map((user) => ({
      key: user.id,
      label: `${user.firstName} ${user.lastName}`,
    }))
}

function renderClearableUserSelectRow(
  label: string,
  value: string | undefined,
  valueSet: (value: string | undefined) => void,
  options: TSelectOption[],
) {
  return $(FormRow, {
    bpColumn: MVP_ROW_BP,
    children: addkeys([
      $(FormLabel, {
        label,
        width: MVP_LABEL_WIDTH,
      }),
      $(FormRow, {
        grow: true,
        children: addkeys([
          $(InputSelect, {
            value,
            valueSet,
            options,
          }),
          $(FormBadge, {
            noshrink: true,
            icon: 'times',
            click: () => valueSet(undefined),
          }),
        ]),
      }),
    ]),
  })
}

function renderSpiritGrid() {
  return $(FormHelp, {
    children: addkeys([
      'See details of the Spirit Scoring System ',
      $('a', {
        href: 'https://d36m266ykvepgv.cloudfront.net/uploads/media/aTYVA2eazu/o/sotg-scoring-system-template-2019.pdf',
        target: '_blank',
        children: 'here',
      }),
    ]),
  })
}

export function renderFixtureSelect(
  fixtureId: string | undefined,
  setFixtureId: (value: string) => void,
  fixtures: TFixture[] | undefined,
  disabled?: boolean,
) {
  if (fixtures === undefined) {
    return $(Spinner)
  }

  return $(FormRow, {
    children: addkeys([
      $(FormLabel, {label: 'Fixture'}),
      $(InputSelect, {
        disabled,
        value: fixtureId,
        valueSet: setFixtureId,
        options: formatFixtureOptions(fixtures),
      }),
    ]),
  })
}

export function renderTeamSelect(
  teamId: string | undefined,
  setTeamId: (value: string) => void,
  teams: TTeam[],
  disabled: boolean = false,
) {
  return $(FormRow, {
    children: addkeys([
      $(FormLabel, {
        label: 'For',
      }),
      $(InputSelect, {
        disabled,
        value: teamId,
        valueSet: setTeamId,
        options: formatTeamOptions(teams),
      }),
    ]),
  })
}

export function renderAgainstTeamSelect(
  againstTeamId: string | undefined,
  setAgainstTeamId: (value: string) => void,
  againstOptions: ReportAgainstOption[],
  disabled: boolean = false,
) {
  return $(FormRow, {
    children: addkeys([
      $(FormLabel, {
        label: 'Against',
      }),
      $(InputSelect, {
        disabled,
        value: againstTeamId,
        valueSet: setAgainstTeamId,
        options: formatAgainstOptions(againstOptions),
      }),
    ]),
  })
}

export function renderTeamHeader(
  teamId: string | undefined,
  teamName: string | undefined,
  teamColor: string | undefined,
  againstTeamId: string | undefined,
  setAgainstTeamId: (value: string) => void,
  againstOptions: ReportAgainstOption[] | undefined,
) {
  if (!teamId || !againstOptions) return null

  const background = hsla.digest(teamColor || '')

  return $('div', {
    style: {textAlign: 'center'},
    children: $(FormRow, {
      children: addkeys([
        $(FormBadge, {
          label: teamName,
          background,
          font: background.compliment(),
          wrap: true,
        }),
        $(FormBadge, {
          label: 'vs',
        }),
        $(InputSelect, {
          value: againstTeamId,
          valueSet: setAgainstTeamId,
          options: formatAgainstOptions(againstOptions),
        }),
      ]),
    }),
  })
}

export function renderScoreInputs(
  scoreFor: number | undefined,
  setScoreFor: (value: number | undefined) => void,
  scoreAgainst: number | undefined,
  setScoreAgainst: (value: number | undefined) => void,
  adminVersion?: boolean,
) {
  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        bpColumn: SCORE_LABEL_BP,
        children: addkeys([
          $(FormLabel, {
            width: SCORE_LABEL_WIDTH,
            label: adminVersion ? 'For Score' : 'Your Score',
            wrap: true,
            style: SCORE_LABEL_STYLE,
          }),
          $(InputNumber, {
            value: scoreFor,
            valueSet: setScoreFor,
          }),
        ]),
      }),
      $(FormRow, {
        bpColumn: SCORE_LABEL_BP,
        children: addkeys([
          $(FormLabel, {
            width: SCORE_LABEL_WIDTH,
            label: adminVersion ? 'Against Score' : 'Opponent Score',
            wrap: true,
            style: SCORE_LABEL_STYLE,
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

export function renderMVPInputs(
  mvpMale: string | undefined,
  setMvpMale: (value: string | undefined) => void,
  mvpFemale: string | undefined,
  setMvpFemale: (value: string | undefined) => void,
  users: TUserPublic[],
  useOfficialScoring?: boolean,
  mvpMale2?: string | undefined,
  setMvpMale2?: (value: string | undefined) => void,
  mvpFemale2?: string | undefined,
  setMvpFemale2?: (value: string | undefined) => void,
  season?: TSeason,
) {
  const slots = getSeasonMvpSlots(season)
  const rows = [
    slots.male
      ? renderClearableUserSelectRow(
          `MVP Male${useOfficialScoring ? ' 1' : ''}`,
          mvpMale,
          setMvpMale,
          formatUserOptions(users, 'male', mvpMale2),
        )
      : undefined,
    slots.male && useOfficialScoring && setMvpMale2
      ? renderClearableUserSelectRow(
          'MVP Male 2',
          mvpMale2,
          setMvpMale2,
          formatUserOptions(users, 'male', mvpMale),
        )
      : undefined,
    slots.female
      ? renderClearableUserSelectRow(
          `MVP Female${useOfficialScoring ? ' 1' : ''}`,
          mvpFemale,
          setMvpFemale,
          formatUserOptions(users, 'female', mvpFemale2),
        )
      : undefined,
    slots.female && useOfficialScoring && setMvpFemale2
      ? renderClearableUserSelectRow(
          'MVP Female 2',
          mvpFemale2,
          setMvpFemale2,
          formatUserOptions(users, 'female', mvpFemale),
        )
      : undefined,
  ]

  return $(FormColumn, {
    children: addkeys(rows),
  })
}

export function renderSpiritInputs(
  spirit: number | undefined,
  setSpirit: (value: number) => void,
  spiritComment: string,
  setSpiritComment: (value: string) => void,
  useOfficialScoring?: boolean,
) {
  if (useOfficialScoring) {
    return null
  }

  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        bpColumn: theme.fib[12],
        children: addkeys([
          $(FormLabel, {
            label: 'Spirit Score',
          }),
          $(InputSelect, {
            value: spirit?.toString(),
            valueSet: (value: string) => setSpirit(Number(value)),
            placeholder: 'Select...',
            options: SPIRIT_OPTIONS,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(InputTextarea, {
            value: spiritComment,
            valueSet: setSpiritComment,
            placeholder: 'Write a comment... (optional)',
          }),
        ]),
      }),
      renderSpiritGrid(),
    ]),
  })
}

export function renderOfficialSpiritInputs(
  spiritP1: number | undefined,
  setSpiritP1: (value: number) => void,
  spiritP2: number | undefined,
  setSpiritP2: (value: number) => void,
  spiritP3: number | undefined,
  setSpiritP3: (value: number) => void,
  spiritP4: number | undefined,
  setSpiritP4: (value: number) => void,
  spiritP5: number | undefined,
  setSpiritP5: (value: number) => void,
  spiritComment: string,
  setSpiritComment: (value: string) => void,
) {
  const officialSpiritFields = [
    {
      title: SPIRIT_CATEGORY_DESCRIPTIONS.spiritP1.title,
      value: spiritP1,
      valueSet: setSpiritP1,
    },
    {
      title: SPIRIT_CATEGORY_DESCRIPTIONS.spiritP2.title,
      value: spiritP2,
      valueSet: setSpiritP2,
    },
    {
      title: SPIRIT_CATEGORY_DESCRIPTIONS.spiritP3.title,
      value: spiritP3,
      valueSet: setSpiritP3,
    },
    {
      title: SPIRIT_CATEGORY_DESCRIPTIONS.spiritP4.title,
      value: spiritP4,
      valueSet: setSpiritP4,
    },
    {
      title: SPIRIT_CATEGORY_DESCRIPTIONS.spiritP5.title,
      value: spiritP5,
      valueSet: setSpiritP5,
    },
  ]

  return $(FormColumn, {
    children: addkeys([
      $(FormLabel, {
        label: 'Spirit Score',
      }),
      renderSpiritGrid(),
      ...officialSpiritFields.map((field) => {
        return $(FormRow, {
          children: addkeys([
            $(FormLabel, {
              label: field.title,
              width: SPIRIT_LABEL_WIDTH,
              wrap: true,
            }),
            $(InputSelect, {
              value: field.value?.toString(),
              valueSet: (value: string) => field.valueSet(Number(value)),
              placeholder: 'Select...',
              options: SPIRIT_CATEGORY_OPTIONS,
            }),
          ]),
        })
      }),
      $(FormRow, {
        children: addkeys([
          $(InputTextarea, {
            value: spiritComment,
            valueSet: setSpiritComment,
            placeholder: 'Write a comment...',
          }),
        ]),
      }),
    ]),
  })
}

export function renderSubmitButton(
  loading: boolean = false,
  onClick: () => void,
) {
  return $(FormBadge, {
    disabled: loading,
    label: loading ? 'Loading' : 'Submit',
    click: onClick,
  })
}

export function validateReportForm(
  formData: ReportFormData,
  useOfficialScoring?: boolean,
  season?: TSeason,
): string | undefined {
  if (!formData.fixtureId) {
    return 'Fixture is required.'
  }

  if (!formData.teamId) {
    return 'Team is required.'
  }

  if (!formData.againstTeamId) {
    return 'Opposition team is required.'
  }

  if (formData.scoreFor === undefined || formData.scoreAgainst === undefined) {
    return 'Both scores are required.'
  }

  const slots = getSeasonMvpSlots(season)

  if (
    slots.male &&
    slots.female &&
    formData.mvpMale &&
    formData.mvpMale === formData.mvpFemale
  ) {
    return 'The male and female MVP cannot be the same person.'
  }

  if (useOfficialScoring) {
    if (
      slots.male &&
      formData.mvpMale &&
      formData.mvpMale === formData.mvpMale2
    ) {
      return 'The 5-point and 3-point male MVPs cannot be the same person.'
    }
    if (
      slots.female &&
      formData.mvpFemale &&
      formData.mvpFemale === formData.mvpFemale2
    ) {
      return 'The 5-point and 3-point female MVPs cannot be the same person.'
    }
    if (
      slots.male &&
      slots.female &&
      formData.mvpMale2 &&
      formData.mvpMale2 === formData.mvpFemale2
    ) {
      return 'The 3-point male and female MVPs cannot be the same person.'
    }
    if (
      slots.male &&
      slots.female &&
      formData.mvpMale &&
      formData.mvpMale === formData.mvpFemale2
    ) {
      return 'The 5-point male MVP and 3-point female MVP cannot be the same person.'
    }
    if (
      slots.male &&
      slots.female &&
      formData.mvpFemale &&
      formData.mvpFemale === formData.mvpMale2
    ) {
      return 'The 5-point female MVP and 3-point male MVP cannot be the same person.'
    }

    if (
      formData.spiritP1 === undefined ||
      formData.spiritP2 === undefined ||
      formData.spiritP3 === undefined ||
      formData.spiritP4 === undefined ||
      formData.spiritP5 === undefined
    ) {
      return 'All five spirit categories must be rated for official scoring.'
    }

    const officialSpiritCommentError = validateOfficialSpiritComment(formData)
    if (officialSpiritCommentError) {
      return officialSpiritCommentError
    }
  } else if (formData.spirit === undefined) {
    return 'Spirit score is required.'
  }

  return undefined
}

export {isReportMvpCompleteForSeason}

export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}
