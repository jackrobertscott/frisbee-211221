import {io} from '@shared/torva'

export const USER_GENDERS = ['male', 'female', 'non-binary', 'other'] as const

export type TUserGender = (typeof USER_GENDERS)[number]

const normalizeGenderKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

const normalizeGenderWords = (value: string): string[] => {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((word) => word.length > 0)
}

const USER_GENDER_ALIASES: Array<readonly [TUserGender, readonly string[]]> = [
  [
    'male',
    [
      'male',
      'male matching',
      'male-matching',
      'm',
      'man',
      'men',
      'mens',
      'boy',
      'boys',
      'masculine',
      'cis male',
      'cis man',
      'trans male',
      'trans man',
      'transgender male',
      'ftm',
      'female to male',
    ],
  ],
  [
    'female',
    [
      'female',
      'female matching',
      'female-matching',
      'f',
      'woman',
      'women',
      'womens',
      'womxn',
      'girl',
      'girls',
      'lady',
      'ladies',
      'feminine',
      'cis female',
      'cis woman',
      'trans female',
      'trans woman',
      'transgender female',
      'mtf',
      'male to female',
    ],
  ],
  [
    'non-binary',
    [
      'non-binary',
      'non binary',
      'nonbinary',
      'non-binary / gender diverse',
      'non binary gender diverse',
      'gender diverse',
      'gender-diverse',
      'genderqueer',
      'gender queer',
      'gender fluid',
      'genderfluid',
      'agender',
      'bigender',
      'enby',
      'nb',
      'x',
    ],
  ],
  [
    'other',
    [
      'other',
      'o',
      'u',
      'unspecified',
      'not specified',
      'not supplied',
      'not provided',
      'not stated',
      'unknown',
      'undisclosed',
      'prefer not to say',
      'prefer not to answer',
      'decline to answer',
      'declined',
      'self-described',
      'self described',
      'self-describe',
      'self describe',
      'another gender',
      'different identity',
      'not listed',
      'n/a',
      'na',
      'none',
    ],
  ],
]

const USER_GENDER_NORMALIZED_MAP = new Map<string, TUserGender>(
  USER_GENDER_ALIASES.flatMap(([gender, aliases]) =>
    aliases.map((alias): [string, TUserGender] => [
      normalizeGenderKey(alias),
      gender,
    ]),
  ),
)

const hasGenderWord = (
  words: readonly string[],
  candidates: readonly string[],
): boolean => {
  return candidates.some((candidate) => words.includes(candidate))
}

const hasOtherGenderKey = (
  key: string,
  words: readonly string[],
): boolean => {
  return (
    key.startsWith('prefernot') ||
    key.startsWith('decline') ||
    key.includes('notsay') ||
    key.includes('notanswer') ||
    key.includes('selfdescribe') ||
    key.includes('selfdescribed') ||
    hasGenderWord(words, [
      'other',
      'unspecified',
      'unknown',
      'undisclosed',
      'declined',
    ])
  )
}

export const normalizeUserGender = (value: string): TUserGender | undefined => {
  const key = normalizeGenderKey(value)
  if (!key) return undefined

  const normalizedValue = USER_GENDER_NORMALIZED_MAP.get(key)
  if (normalizedValue) return normalizedValue

  const words = normalizeGenderWords(value)
  const inferredValues: TUserGender[] = []

  if (
    key.includes('nonbinary') ||
    key.includes('genderdiverse') ||
    key.includes('genderqueer') ||
    key.includes('genderfluid') ||
    hasGenderWord(words, ['nonbinary', 'enby', 'nb', 'x', 'agender', 'bigender'])
  ) {
    inferredValues.push('non-binary')
  }

  if (
    hasGenderWord(words, [
      'female',
      'f',
      'woman',
      'women',
      'womens',
      'girl',
      'girls',
      'lady',
      'ladies',
    ])
  ) {
    inferredValues.push('female')
  }

  if (
    hasGenderWord(words, ['male', 'm', 'man', 'men', 'mens', 'boy', 'boys'])
  ) {
    inferredValues.push('male')
  }

  if (inferredValues.length > 1 || hasOtherGenderKey(key, words)) return 'other'
  if (inferredValues.length === 1) return inferredValues[0]
  return undefined
}

export const ioUserGender = io.custom<TUserGender>((value) => {
  if (typeof value !== 'string')
    return {ok: false, error: 'Enum value is not a string.'}
  const normalizedValue = normalizeUserGender(value)
  if (!normalizedValue)
    return {ok: false, error: 'Value is not a valid enum option.'}
  return {ok: true, value: normalizedValue}
})
