/* User display helpers: gender matching options/labels and the primary email. */
import {TUserSafe} from '@shared/schemas/ioUser'
import {TUserGenderMatching} from '@shared/schemas/ioUserGenderMatching'

export {isUserGenderMatching} from '@shared/schemas/ioUserGenderMatching'

/** Gender matching select options, in display order. */
export const genderMatchingOptions: Array<{
  value: TUserGenderMatching
  label: string
}> = [
  {value: 'male', label: 'Male'},
  {value: 'female', label: 'Female'},
]

/** Explains gender matching wherever players pick their own. */
export const GENDER_MATCHING_DESCRIPTION =
  'Decides whether you are voted for as a male or female MVP.'

export const genderMatchingLabel = (genderMatching: TUserGenderMatching) =>
  genderMatchingOptions.find((g) => g.value === genderMatching)?.label ??
  genderMatching

/** The user's primary email, falling back to their first one. */
export const primaryEmail = (user: TUserSafe) =>
  user.emails.find((i) => i.primary)?.value ?? user.emails[0]?.value
