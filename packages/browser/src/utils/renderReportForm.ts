import {theme} from '@browser/theme'
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
import {
  SPIRIT_CATEGORY_DESCRIPTIONS,
  SPIRIT_CATEGORY_OPTIONS,
  SPIRIT_OPTIONS,
} from './constants'
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
  mvpMale2?: undefined | string
  mvpFemale2?: undefined | string
  spirit: undefined | number
  spiritComment: string
  // Official Spirit Categories
  spiritP1?: undefined | number
  spiritP2?: undefined | number
  spiritP3?: undefined | number
  spiritP4?: undefined | number
  spiritP5?: undefined | number
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
      $(FormLabel, {
        width: theme.fib[11],
        label: 'For',
      }),
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
      $(FormLabel, {
        width: theme.fib[11],
        label: 'Against',
      }),
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
          $(FormLabel, {
            width: theme.fib[11],
            label: adminVersion ? 'For Score' : 'Your Score',
          }),
          $(InputNumber, {
            value: scoreFor,
            valueSet: setScoreFor,
          }),
        ]),
      }),
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
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
  users: TUserPublic[],
  useOfficialScoring?: boolean,
  mvpMale2?: string | undefined,
  setMvpMale2?: (value: string | undefined) => void,
  mvpFemale2?: string | undefined,
  setMvpFemale2?: (value: string | undefined) => void
) {
  const formElements = []

  formElements.push(
    $(FormRow, {
      children: addkeys([
        $(FormLabel, {
          width: theme.fib[11],
          label: 'MVP Male' + (useOfficialScoring ? ' 1' : ''),
        }),
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
    })
  )

  if (useOfficialScoring && setMvpMale2) {
    formElements.push(
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: 'MVP Male' + (useOfficialScoring ? ' 2' : ''),
          }),
          $(InputSelect, {
            value: mvpMale2,
            valueSet: setMvpMale2,
            options: users.map((i) => ({
              key: i.id,
              label: `${i.firstName} ${i.lastName}`,
            })),
          }),
          $(FormBadge, {
            icon: 'times',
            click: () => setMvpMale2(undefined),
          }),
        ]),
      })
    )
  }

  formElements.push(
    $(FormRow, {
      children: addkeys([
        $(FormLabel, {
          width: theme.fib[11],
          label: 'MVP Female' + (useOfficialScoring ? ' 1' : ''),
        }),
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
    })
  )

  if (useOfficialScoring && setMvpFemale2) {
    formElements.push(
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: 'MVP Female' + (useOfficialScoring ? ' 2' : ''),
          }),
          $(InputSelect, {
            value: mvpFemale2,
            valueSet: setMvpFemale2,
            options: users.map((i) => ({
              key: i.id,
              label: `${i.firstName} ${i.lastName}`,
            })),
          }),
          $(FormBadge, {
            icon: 'times',
            click: () => setMvpFemale2(undefined),
          }),
        ]),
      })
    )
  }

  return $(FormColumn, {
    children: addkeys(formElements),
  })
}

/**
 * Renders spirit score and comment inputs
 */
export function renderSpiritInputs(
  spirit: number | undefined,
  setSpirit: (value: number) => void,
  spiritComment: string,
  setSpiritComment: (value: string) => void,
  useOfficialScoring?: boolean
) {
  // If using official scoring, this function shouldn't be called
  // Instead, use renderOfficialSpiritInputs
  if (useOfficialScoring) {
    return null
  }

  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: 'Spirit Score',
          }),
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

      renderSpiritGrid(),
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

/**
 * Renders the official spirit scoring form with the five categories
 */
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
  setSpiritComment: (value: string) => void
) {
  const {
    spiritP1: p1,
    spiritP2: p2,
    spiritP3: p3,
    spiritP4: p4,
    spiritP5: p5,
  } = SPIRIT_CATEGORY_DESCRIPTIONS

  return $(FormColumn, {
    children: addkeys([
      $(FormLabel, {
        label: 'Spirit Score',
      }),

      renderSpiritGrid(),

      // Category 1
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: p1.title,
          }),
          $(InputSelect, {
            value: spiritP1?.toString(),
            valueSet: (i) => setSpiritP1(+i),
            placeholder: 'Select...',
            options: SPIRIT_CATEGORY_OPTIONS,
          }),
        ]),
      }),
      // $(FormHelp, {
      //   children: p1.description,
      // }),

      // Category 2
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: p2.title,
          }),
          $(InputSelect, {
            value: spiritP2?.toString(),
            valueSet: (i) => setSpiritP2(+i),
            placeholder: 'Select...',
            options: SPIRIT_CATEGORY_OPTIONS,
          }),
        ]),
      }),
      // $(FormHelp, {
      //   children: p2.description,
      // }),

      // Category 3
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: p3.title,
          }),
          $(InputSelect, {
            value: spiritP3?.toString(),
            valueSet: (i) => setSpiritP3(+i),
            placeholder: 'Select...',
            options: SPIRIT_CATEGORY_OPTIONS,
          }),
        ]),
      }),
      // $(FormHelp, {
      //   children: p3.description,
      // }),

      // Category 4
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: p4.title,
          }),
          $(InputSelect, {
            value: spiritP4?.toString(),
            valueSet: (i) => setSpiritP4(+i),
            placeholder: 'Select...',
            options: SPIRIT_CATEGORY_OPTIONS,
          }),
        ]),
      }),
      // $(FormHelp, {
      //   children: p4.description,
      // }),

      // Category 5
      $(FormRow, {
        children: addkeys([
          $(FormLabel, {
            width: theme.fib[11],
            label: p5.title,
          }),
          $(InputSelect, {
            value: spiritP5?.toString(),
            valueSet: (i) => setSpiritP5(+i),
            placeholder: 'Select...',
            options: SPIRIT_CATEGORY_OPTIONS,
          }),
        ]),
      }),
      // $(FormHelp, {
      //   children: p5.description,
      // }),

      // Comments
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
  formData: ReportFormData,
  useOfficialScoring?: boolean
): string | undefined {
  // Check for duplicate MVPs between main (5 pts) and secondary (3 pts) selections
  if (formData.mvpMale && formData.mvpMale === formData.mvpFemale) {
    return 'The male and female MVP cannot be the same person.'
  }

  // Additional validation for official scoring
  if (useOfficialScoring) {
    // Check for duplicated MVPs between main and secondary
    if (formData.mvpMale && formData.mvpMale === formData.mvpMale2) {
      return 'The 5-point and 3-point male MVPs cannot be the same person.'
    }
    if (formData.mvpFemale && formData.mvpFemale === formData.mvpFemale2) {
      return 'The 5-point and 3-point female MVPs cannot be the same person.'
    }
    if (formData.mvpMale2 && formData.mvpMale2 === formData.mvpFemale2) {
      return 'The 3-point male and female MVPs cannot be the same person.'
    }
    if (formData.mvpMale && formData.mvpMale === formData.mvpFemale2) {
      return 'The 5-point male MVP and 3-point female MVP cannot be the same person.'
    }
    if (formData.mvpFemale && formData.mvpFemale === formData.mvpMale2) {
      return 'The 5-point female MVP and 3-point male MVP cannot be the same person.'
    }

    // Check that all 5 spirit categories are filled for official scoring
    if (
      formData.spiritP1 === undefined ||
      formData.spiritP2 === undefined ||
      formData.spiritP3 === undefined ||
      formData.spiritP4 === undefined ||
      formData.spiritP5 === undefined
    ) {
      return 'All five spirit categories must be rated for official scoring.'
    }
  } else {
    // Regular spirit score is required for non-official scoring
    if (formData.spirit === undefined) {
      return 'Spirit score is required.'
    }
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
