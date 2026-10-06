import {io} from '@shared/torva'

/**
 * Gender matching decides which MVP slot (male or female) a player is voted
 * into. It is not the player's gender identity, so only these two values exist.
 */
export const USER_GENDER_MATCHINGS = ['male', 'female'] as const

export type TUserGenderMatching = (typeof USER_GENDER_MATCHINGS)[number]

/** Used when a gender matching cannot be worked out, e.g. imports and backfills. */
export const FALLBACK_USER_GENDER_MATCHING: TUserGenderMatching = 'female'

export const isUserGenderMatching = (
  value: unknown,
): value is TUserGenderMatching =>
  USER_GENDER_MATCHINGS.some((matching) => matching === value)

const normalizeGenderMatchingKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

const normalizeGenderMatchingWords = (value: string): string[] => {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((word) => word.length > 0)
}

const USER_GENDER_MATCHING_ALIASES: Array<
  readonly [TUserGenderMatching, readonly string[]]
> = [
  [
    'male',
    [
      'male',
      'male matching',
      'male-matching',
      'mmp',
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
      'fmp',
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
]

const USER_GENDER_MATCHING_NORMALIZED_MAP = new Map<
  string,
  TUserGenderMatching
>(
  USER_GENDER_MATCHING_ALIASES.flatMap(([matching, aliases]) =>
    aliases.map((alias): [string, TUserGenderMatching] => [
      normalizeGenderMatchingKey(alias),
      matching,
    ]),
  ),
)

const hasWord = (
  words: readonly string[],
  candidates: readonly string[],
): boolean => {
  return candidates.some((candidate) => words.includes(candidate))
}

/** Values that name neither matching, so a male/female word inside them is not trusted. */
const hasUnmatchedKey = (key: string, words: readonly string[]): boolean => {
  return (
    key.includes('nonbinary') ||
    key.includes('genderdiverse') ||
    key.includes('genderqueer') ||
    key.includes('genderfluid') ||
    key.startsWith('prefernot') ||
    key.startsWith('decline') ||
    key.includes('notsay') ||
    key.includes('notanswer') ||
    key.includes('selfdescribe') ||
    hasWord(words, [
      'nb',
      'enby',
      'x',
      'agender',
      'bigender',
      'other',
      'unspecified',
      'unknown',
      'undisclosed',
      'declined',
    ])
  )
}

/**
 * Maps free text (form input, CSV or GameDay values) to a gender matching.
 * Returns undefined when the value does not clearly name male or female.
 */
export const normalizeUserGenderMatching = (
  value: string,
): TUserGenderMatching | undefined => {
  const key = normalizeGenderMatchingKey(value)
  if (!key) return undefined

  const normalizedValue = USER_GENDER_MATCHING_NORMALIZED_MAP.get(key)
  if (normalizedValue) return normalizedValue

  const words = normalizeGenderMatchingWords(value)
  if (hasUnmatchedKey(key, words)) return undefined

  const inferredValues: TUserGenderMatching[] = []
  if (
    hasWord(words, [
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
  if (hasWord(words, ['male', 'm', 'man', 'men', 'mens', 'boy', 'boys'])) {
    inferredValues.push('male')
  }

  return inferredValues.length === 1 ? inferredValues[0] : undefined
}

export const ioUserGenderMatching = io.custom<TUserGenderMatching>((value) => {
  if (typeof value !== 'string')
    return {ok: false, error: 'Enum value is not a string.'}
  const normalizedValue = normalizeUserGenderMatching(value)
  if (!normalizedValue)
    return {ok: false, error: 'Value is not a valid enum option.'}
  return {ok: true, value: normalizedValue}
})
