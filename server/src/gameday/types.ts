export interface TGamedayExportInput {
  startingUrl: string
  username: string
  password: string
  association: string
  competition: string
  headless?: boolean
  browserChannel?: string
  browserExecutablePath?: string
  reportId?: string
  timeoutMs?: number
  debug?: boolean
  fields?: string[]
  headers?: string[]
}

export interface TGamedayExportMember {
  teamName: string
  firstName: string
  lastName: string
  email: string
  gender: string
}

export interface TGamedayExportOutput {
  members: TGamedayExportMember[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readRequiredString = (
  record: Record<string, unknown>,
  key: keyof TGamedayExportInput,
  trim = true,
) => {
  const value = record[key]
  if (typeof value !== 'string') throw new Error(`${key} is required.`)
  const normalizedValue = trim ? value.trim() : value
  if (!normalizedValue.length) throw new Error(`${key} is required.`)
  return normalizedValue
}

const readOptionalString = (
  record: Record<string, unknown>,
  key: keyof TGamedayExportInput,
) => {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`)
  const normalizedValue = value.trim()
  return normalizedValue || undefined
}

const readOptionalBoolean = (
  record: Record<string, unknown>,
  key: keyof TGamedayExportInput,
) => {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean.`)
  return value
}

const readOptionalNumber = (
  record: Record<string, unknown>,
  key: keyof TGamedayExportInput,
) => {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`)
  }
  return value
}

const readOptionalStringArray = (
  record: Record<string, unknown>,
  key: keyof TGamedayExportInput,
) => {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${key} must be an array of strings.`)
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

export const parseGamedayExportInput = (
  value: unknown,
): TGamedayExportInput => {
  if (!isRecord(value)) throw new Error('Input must be an object.')
  return {
    startingUrl: readRequiredString(value, 'startingUrl'),
    username: readRequiredString(value, 'username'),
    password: readRequiredString(value, 'password', false),
    association: readRequiredString(value, 'association'),
    competition: readRequiredString(value, 'competition'),
    headless: readOptionalBoolean(value, 'headless'),
    browserChannel: readOptionalString(value, 'browserChannel'),
    browserExecutablePath: readOptionalString(value, 'browserExecutablePath'),
    reportId: readOptionalString(value, 'reportId'),
    timeoutMs: readOptionalNumber(value, 'timeoutMs'),
    debug: readOptionalBoolean(value, 'debug'),
    fields: readOptionalStringArray(value, 'fields'),
    headers: readOptionalStringArray(value, 'headers'),
  }
}

const isGamedayExportMember = (
  value: unknown,
): value is TGamedayExportMember => {
  if (!isRecord(value)) return false
  return (
    typeof value.teamName === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string' &&
    typeof value.email === 'string' &&
    typeof value.gender === 'string'
  )
}

export const isGamedayExportOutput = (
  value: unknown,
): value is TGamedayExportOutput => {
  if (!isRecord(value) || !Array.isArray(value.members)) return false
  return value.members.every(isGamedayExportMember)
}
