import {badRequestError} from '@shared/errors'

export const MEMBER_IMPORT_REQUIRED_HEADINGS: readonly string[] = [
  'team_name',
  'email_address',
  'first_name',
  'last_name',
]

export const MEMBER_IMPORT_ALLOWED_HEADINGS: readonly string[] = [
  'team_name',
  'team_division',
  'type',
  'email_address',
  'first_name',
  'last_name',
  'gender_matching',
  // older spreadsheets name the gender matching column `gender`
  'gender',
]

/**
 * Rejects a parsed member import CSV whose first row is missing a required
 * heading or has a heading the import does not understand.
 */
export const assertMemberImportHeadings = (
  objects: Record<string, string>[],
): void => {
  const providedHeadings = objects.length > 0 ? Object.keys(objects[0]) : []
  const missingHeadings = MEMBER_IMPORT_REQUIRED_HEADINGS.filter(
    (h) => !providedHeadings.includes(h),
  )
  if (missingHeadings.length > 0)
    throw badRequestError(
      `Missing required headings: ${missingHeadings.join(', ')}`,
    )
  const unexpectedHeadings = providedHeadings.filter(
    (h) => !MEMBER_IMPORT_ALLOWED_HEADINGS.includes(h),
  )
  if (unexpectedHeadings.length > 0)
    throw badRequestError(
      `Unexpected headings found: ${unexpectedHeadings.join(', ')}`,
    )
}
