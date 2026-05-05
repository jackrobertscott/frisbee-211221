import {io} from '@shared/torva'

export const USER_GENDERS = ['male', 'female', 'non-binary', 'other'] as const

export type TUserGender = (typeof USER_GENDERS)[number]

const USER_GENDER_NORMALIZED_MAP = new Map<string, TUserGender>([
  ['male', 'male'],
  ['female', 'female'],
  ['nonbinary', 'non-binary'],
  ['other', 'other'],
])

const normalizeGenderKey = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export const normalizeUserGender = (value: string) => {
  return USER_GENDER_NORMALIZED_MAP.get(normalizeGenderKey(value))
}

export const ioUserGender = io.custom<TUserGender>((value) => {
  if (typeof value !== 'string')
    return {ok: false, error: 'Enum value is not a string.'}
  const normalizedValue = normalizeUserGender(value)
  if (!normalizedValue)
    return {ok: false, error: 'Value is not a valid enum option.'}
  return {ok: true, value: normalizedValue}
})
