/* User display helpers: gender options/labels and the primary email. */
import {TUserSafe} from '@shared/schemas/ioUser'
import {TUserGender, USER_GENDERS} from '@shared/schemas/ioUserGender'

/** Gender select options, in display order. */
export const genderOptions: Array<{value: TUserGender; label: string}> = [
  {value: 'male', label: 'Male'},
  {value: 'female', label: 'Female'},
  {value: 'non-binary', label: 'Non-Binary'},
  {value: 'other', label: 'Other'},
]

export const genderLabel = (gender: TUserGender) =>
  genderOptions.find((g) => g.value === gender)?.label ?? gender

export const isUserGender = (value: string | null): value is TUserGender =>
  USER_GENDERS.some((g) => g === value)

/** The user's primary email, falling back to their first one. */
export const primaryEmail = (user: TUserSafe) =>
  user.emails.find((i) => i.primary)?.value ?? user.emails[0]?.value
