export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

const STATUS_TEXT_BY_CODE: Record<number, string> = {
  [HTTP_STATUS.BAD_REQUEST]: 'Bad Request',
  [HTTP_STATUS.UNAUTHORIZED]: 'Unauthorized',
  [HTTP_STATUS.FORBIDDEN]: 'Forbidden',
  [HTTP_STATUS.NOT_FOUND]: 'Not Found',
  [HTTP_STATUS.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [HTTP_STATUS.CONFLICT]: 'Conflict',
  [HTTP_STATUS.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HTTP_STATUS.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HTTP_STATUS.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HTTP_STATUS.SERVICE_UNAVAILABLE]: 'Service Unavailable',
}

const JWT_ERROR_NAMES = new Set([
  'JsonWebTokenError',
  'TokenExpiredError',
  'NotBeforeError',
])

export interface AppErrorOptions {
  message: string
  userMessage?: string
  statusCode?: number
  errorCode?: string
  expose?: boolean
  details?: unknown
  retryable?: boolean
  cause?: unknown
  meta?: Record<string, unknown>
  tarpit?: unknown
  name?: string
}

export interface SerializedAppError {
  type: 'app_error'
  name: 'AppError'
  message: string
  userMessage: string
  statusCode: number
  code: number
  status: string
  errorCode: string
  expose: boolean
  retryable: boolean
  details?: unknown
  meta?: Record<string, unknown>
  lines?: string[]
}

type AppErrorLike = Error & {
  userMessage?: unknown
  statusCode?: unknown
  code?: unknown
  errorCode?: unknown
  expose?: unknown
  details?: unknown
  retryable?: unknown
  cause?: unknown
  meta?: unknown
  tarpit?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStatusCode = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 400 &&
  value <= 599

const getStatusText = (statusCode: number) =>
  STATUS_TEXT_BY_CODE[statusCode] ??
  STATUS_TEXT_BY_CODE[HTTP_STATUS.INTERNAL_SERVER_ERROR]

const getDefaultErrorCode = (statusCode: number) => {
  switch (statusCode) {
    case HTTP_STATUS.BAD_REQUEST:
      return 'bad_request'
    case HTTP_STATUS.UNAUTHORIZED:
      return 'unauthorized'
    case HTTP_STATUS.FORBIDDEN:
      return 'forbidden'
    case HTTP_STATUS.NOT_FOUND:
      return 'not_found'
    case HTTP_STATUS.METHOD_NOT_ALLOWED:
      return 'method_not_allowed'
    case HTTP_STATUS.CONFLICT:
      return 'conflict'
    case HTTP_STATUS.UNPROCESSABLE_ENTITY:
      return 'validation_error'
    case HTTP_STATUS.TOO_MANY_REQUESTS:
      return 'too_many_requests'
    case HTTP_STATUS.SERVICE_UNAVAILABLE:
      return 'service_unavailable'
    default:
      return 'internal_error'
  }
}

const INTERNAL_USER_MESSAGE =
  'Something went wrong while completing your request. Please try again in a moment.'

const STATUS_USER_MESSAGE_BY_CODE: Record<number, string> = {
  [HTTP_STATUS.BAD_REQUEST]:
    'Please check the information you entered and try again.',
  [HTTP_STATUS.UNAUTHORIZED]: 'Please sign in to continue.',
  [HTTP_STATUS.FORBIDDEN]: 'You do not have permission to do that.',
  [HTTP_STATUS.NOT_FOUND]: 'We could not find what you were looking for.',
  [HTTP_STATUS.METHOD_NOT_ALLOWED]: 'This action is not available from here.',
  [HTTP_STATUS.CONFLICT]:
    'That change could not be saved because it conflicts with existing information.',
  [HTTP_STATUS.UNPROCESSABLE_ENTITY]:
    'Please check the information you entered and try again.',
  [HTTP_STATUS.TOO_MANY_REQUESTS]:
    'Too many attempts were made. Please wait a little while before trying again.',
  [HTTP_STATUS.INTERNAL_SERVER_ERROR]: INTERNAL_USER_MESSAGE,
  [HTTP_STATUS.SERVICE_UNAVAILABLE]:
    'This feature is temporarily unavailable. Please try again later.',
}

const USER_MESSAGE_BY_ERROR_CODE: Record<string, string> = {
  bad_request: STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.BAD_REQUEST],
  conflict: STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.CONFLICT],
  forbidden: STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.FORBIDDEN],
  internal_error: INTERNAL_USER_MESSAGE,
  method_not_allowed:
    STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.METHOD_NOT_ALLOWED],
  not_found: STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.NOT_FOUND],
  service_unavailable:
    STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.SERVICE_UNAVAILABLE],
  too_many_requests: STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.TOO_MANY_REQUESTS],
  unauthorized: STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.UNAUTHORIZED],
  validation_error:
    STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.UNPROCESSABLE_ENTITY],

  'auth.admin_required': 'You need admin access to do that.',
  'auth.invalid_login': 'The email or password is not correct.',
  'auth.login_rate_limited':
    'Too many login attempts were made. Please wait before trying again.',
  'auth.sign_in_required': 'Please sign in to continue.',
  'auth.team_required': 'Please join a team before doing that.',
  'auth.team_season_mismatch': INTERNAL_USER_MESSAGE,
  'auth.team_set_without_current': INTERNAL_USER_MESSAGE,
  'auth.terms_required': 'Please accept the terms to create an account.',
  'auth.token_invalid': 'Please sign in again to continue.',
  'auth.token_missing': 'Please sign in to continue.',
  'auth.user_mismatch': INTERNAL_USER_MESSAGE,
  'auth.user_set_without_current': INTERNAL_USER_MESSAGE,

  'client.server_url_missing':
    'The app is not set up correctly. Please contact support.',

  'comment.delete_forbidden': 'You can only delete comments you wrote.',
  'comment.update_forbidden': 'You can only change comments you wrote.',

  'db.record_not_found':
    'We could not find the item you were trying to open.',

  'fixture.division_missing':
    'Every team needs a division before fixtures can be created.',
  'fixture.round_robin_invalid':
    'The existing fixtures do not match the expected pattern. Please review the rounds and try again.',
  'fixture.slots_insufficient':
    'There are not enough time slots for the number of teams.',
  'fixture.snapshot_disabled':
    'Fixture snapshots are not available right now.',
  'fixture.uneven_division':
    'Each division needs an even number of teams before fixtures can be created.',

  'intrusion.blocked': 'This page is not available.',
  'intrusion.exploit_probe': 'This page is not available.',
  'intrusion.origin_forbidden': 'This action is not available from here.',
  'intrusion.suspicious_request': 'This page is not available.',

  'portal.element_missing': INTERNAL_USER_MESSAGE,

  'member.already_captain': 'This member is already the captain.',
  'member.already_on_other_team':
    'This person is already on another team for this season.',
  'member.captain_required': 'Only a team captain can do that.',
  'member.request_exists':
    'A membership request has already been sent for this season.',
  'member.user_details_required':
    'Please enter the first name, last name, and gender for the new member.',

  'post.delete_forbidden': 'You can only delete posts you wrote.',
  'post.update_forbidden': 'You can only change posts you wrote.',

  'report.already_submitted':
    'A score report has already been submitted for this game.',
  'report.fixture_invalid':
    'That fixture does not belong to the selected season.',
  'report.matchup_invalid':
    'That opposition team is not listed for your fixture.',
  'report.spirit_comment_required':
    'Please add a spirit comment before submitting the report.',

  'request.failed':
    'We could not complete that action. Please try again in a moment.',
  'request.invalid_handler_response': INTERNAL_USER_MESSAGE,
  'request.method_not_allowed': 'This action is not available from here.',
  'request.origin_invalid': 'This action is not available from here.',
  'request.payload_missing':
    'The page could not send the information needed. Please refresh and try again.',
  'request.route_not_found': 'This page is not available.',
  'request.url_missing': INTERNAL_USER_MESSAGE,

  'router.context_missing': INTERNAL_USER_MESSAGE,
  'router.routes_missing': INTERNAL_USER_MESSAGE,

  'season.id_missing': 'Please choose a season and try again.',
  'season.delete_has_reports':
    'This season cannot be deleted because it has score reports.',
  'season.not_found': 'No season is available yet.',

  'team.access_forbidden': 'You do not have access to that team.',
  'team.captain_required': 'Only a team captain can do that.',
  'team.pending_member_forbidden':
    'Your team membership needs to be accepted before you can do that.',
  'team.signup_closed': 'Team signup is closed for this season.',

  'theme.padify_pixels_invalid': INTERNAL_USER_MESSAGE,
  'throttle.dribble_max_invalid': INTERNAL_USER_MESSAGE,
  unreachable: INTERNAL_USER_MESSAGE,

  'upload.aborted': 'The upload was cancelled before it finished.',
  'upload.fields_limit': 'Too much information was included in the upload.',
  'upload.file_missing': 'Please choose a file to upload.',
  'upload.files_limit': 'Please upload fewer files.',
  'upload.invalid_file_type': 'Please upload a CSV file.',
  'upload.invalid_gender':
    'One of the uploaded gender values was not recognised.',
  'upload.parts_limit': 'The upload was too large to process.',
  'upload.size_limit': 'The uploaded file is too large.',

  'user.code_delivery_rate_limited':
    'Too many codes were requested. Please wait before asking for another one.',
  'user.code_expired':
    'That code has expired. A new code has been sent to your email.',
  'user.code_invalid': 'That code is not correct.',
  'user.code_rate_limited':
    'Too many code attempts were made. Please wait before trying again.',
  'user.email_exists': 'That email is already connected to an account.',
  'user.email_invalid': 'Please enter a valid email address.',
  'user.email_not_found': 'We could not find that email on this account.',
  'user.email_required': 'Your account needs at least one email address.',
  'user.merge_invalid': 'Please choose two different users to merge.',
  'user.old_password_invalid': 'The current password is not correct.',
  'user.password_missing': 'This account does not have a password yet.',
  'user.password_too_short': 'Please use a password with at least 5 characters.',
}

const VALIDATION_FIELD_LABELS: Record<string, string> = {
  code: 'code',
  comment: 'comment',
  direction: 'direction',
  email: 'email address',
  fileType: 'file type',
  firstName: 'first name',
  fixtureId: 'fixture',
  gender: 'gender',
  lastName: 'last name',
  memberId: 'member',
  newPassword: 'new password',
  password: 'password',
  postId: 'post',
  referenceFixtureId: 'reference fixture',
  reportId: 'report',
  roundCount: 'number of rounds',
  seasonId: 'season',
  startingDate: 'starting date',
  teamAgainstId: 'opposition team',
  teamId: 'team',
  termsAccepted: 'terms',
  title: 'title',
  unit: 'unit',
  userId: 'user',
}

const defaultExposeForStatus = (statusCode: number) =>
  statusCode < HTTP_STATUS.INTERNAL_SERVER_ERROR

const extractStatusCode = (value: unknown): number | undefined => {
  if (isStatusCode(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (isStatusCode(parsed)) return parsed
  }
  return undefined
}

const extractErrorCode = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  return /^\d+$/.test(value) ? undefined : value
}

const extractUserMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed || undefined
}

const humanizeFieldName = (field: string) => {
  const key = field.replace(/^\[|\]$/g, '').split('.').at(-1) ?? field
  const cleaned = key.replace(/\[\d+\]/g, '').trim()
  if (VALIDATION_FIELD_LABELS[cleaned]) return VALIDATION_FIELD_LABELS[cleaned]
  return cleaned
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
}

const getValidationField = (details: unknown) => {
  if (typeof details !== 'string') return undefined
  const match = details.match(/^\[([^\]]+)\]:/)
  return match?.[1] ? humanizeFieldName(match[1]) : undefined
}

export const getValidationUserMessage = (details: unknown) => {
  const field = getValidationField(details)
  if (!field) return STATUS_USER_MESSAGE_BY_CODE[HTTP_STATUS.UNPROCESSABLE_ENTITY]
  return `Please check ${field} and try again.`
}

const cleanExposedMessage = (message: string) => {
  const cleaned = message
    .replace(/^failed:\s*/i, '')
    .replace(/^an error occurred:\s*/i, '')
    .replace(/\bcan not\b/gi, 'cannot')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || undefined
}

const getStatusUserMessage = (statusCode: number) =>
  STATUS_USER_MESSAGE_BY_CODE[statusCode] ?? INTERNAL_USER_MESSAGE

const buildUserMessage = ({
  message,
  userMessage,
  statusCode,
  errorCode,
  expose,
  details,
}: {
  message: string
  userMessage?: string
  statusCode: number
  errorCode: string
  expose: boolean
  details?: unknown
}) => {
  const explicit = extractUserMessage(userMessage)
  if (explicit) return explicit
  if (errorCode === 'validation_error') return getValidationUserMessage(details)
  const coded = USER_MESSAGE_BY_ERROR_CODE[errorCode]
  if (coded) return coded
  if (statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR || !expose) {
    return getStatusUserMessage(statusCode)
  }
  return cleanExposedMessage(message) ?? getStatusUserMessage(statusCode)
}

const inferStatusCode = (error: AppErrorLike, fallbackStatusCode?: number) => {
  const directStatusCode =
    extractStatusCode(error.statusCode) ?? extractStatusCode(error.code)
  if (directStatusCode) return directStatusCode
  if (error.name === 'ValidationError') {
    return HTTP_STATUS.UNPROCESSABLE_ENTITY
  }
  if (JWT_ERROR_NAMES.has(error.name) || error.message === 'jwt expired') {
    return HTTP_STATUS.UNAUTHORIZED
  }
  return fallbackStatusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR
}

export class AppError extends Error {
  readonly statusCode: number
  readonly errorCode: string
  readonly userMessage: string
  readonly expose: boolean
  readonly details?: unknown
  readonly retryable: boolean
  readonly cause?: unknown
  readonly meta?: Record<string, unknown>
  readonly tarpit?: unknown

  constructor(options: AppErrorOptions) {
    super(options.message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'AppError'
    this.statusCode = options.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR
    this.errorCode = options.errorCode ?? getDefaultErrorCode(this.statusCode)
    this.expose = options.expose ?? defaultExposeForStatus(this.statusCode)
    this.details = options.details
    this.retryable = options.retryable ?? false
    this.cause = options.cause
    this.meta = options.meta
    this.tarpit = options.tarpit
    this.userMessage = buildUserMessage({
      message: this.message,
      userMessage: options.userMessage,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      expose: this.expose,
      details: this.details,
    })
  }
}

export const createError = (
  options: string | AppErrorOptions,
  overrides: Omit<AppErrorOptions, 'message'> & {message?: string} = {},
) => {
  const base = typeof options === 'string' ? {message: options} : options
  const statusCode =
    overrides.statusCode ?? base.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR
  return new AppError({
    ...base,
    ...overrides,
    message: overrides.message ?? base.message,
    userMessage: overrides.userMessage ?? base.userMessage,
    statusCode,
    errorCode:
      overrides.errorCode ?? base.errorCode ?? getDefaultErrorCode(statusCode),
    expose:
      overrides.expose ?? base.expose ?? defaultExposeForStatus(statusCode),
  })
}

const createStatusFactory =
  (statusCode: number, errorCode?: string) =>
  (
    message: string,
    options: Omit<AppErrorOptions, 'message' | 'statusCode'> = {},
  ) =>
    createError({
      message,
      statusCode,
      errorCode,
      ...options,
    })

export const badRequestError = createStatusFactory(
  HTTP_STATUS.BAD_REQUEST,
  'bad_request',
)
export const unauthorizedError = createStatusFactory(
  HTTP_STATUS.UNAUTHORIZED,
  'unauthorized',
)
export const forbiddenError = createStatusFactory(
  HTTP_STATUS.FORBIDDEN,
  'forbidden',
)
export const notFoundError = createStatusFactory(
  HTTP_STATUS.NOT_FOUND,
  'not_found',
)
export const methodNotAllowedError = createStatusFactory(
  HTTP_STATUS.METHOD_NOT_ALLOWED,
  'method_not_allowed',
)
export const conflictError = createStatusFactory(
  HTTP_STATUS.CONFLICT,
  'conflict',
)
export const validationError = createStatusFactory(
  HTTP_STATUS.UNPROCESSABLE_ENTITY,
  'validation_error',
)
export const tooManyRequestsError = createStatusFactory(
  HTTP_STATUS.TOO_MANY_REQUESTS,
  'too_many_requests',
)
export const internalError = (
  message: string = getStatusText(HTTP_STATUS.INTERNAL_SERVER_ERROR),
  options: Omit<AppErrorOptions, 'message' | 'statusCode' | 'expose'> = {},
) =>
  createError({
    message,
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    errorCode: options.errorCode ?? 'internal_error',
    expose: false,
    ...options,
  })
export const serviceUnavailableError = createStatusFactory(
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  'service_unavailable',
)

export const unreachableError = (
  message: string = 'Unreachable code path.',
): never => {
  throw internalError(message, {errorCode: 'unreachable'})
}

export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError
}

export const isSerializedAppError = (
  error: unknown,
): error is SerializedAppError => {
  if (!isRecord(error)) return false
  const statusCode = extractStatusCode(error.statusCode ?? error.code)
  return (
    (error.type === 'app_error' || error.name === 'AppError') &&
    typeof error.message === 'string' &&
    typeof error.errorCode === 'string' &&
    typeof error.expose === 'boolean' &&
    typeof error.retryable === 'boolean' &&
    Boolean(statusCode)
  )
}

export const toAppError = (
  error: unknown,
  fallback: Omit<AppErrorOptions, 'message'> & {message?: string} = {},
) => {
  if (isAppError(error)) return error
  if (isSerializedAppError(error)) {
    return createError({
      message: error.message,
      userMessage: error.userMessage,
      statusCode: error.statusCode,
      errorCode: error.errorCode,
      expose: error.expose,
      retryable: error.retryable,
      details: error.details,
      meta: error.meta,
    })
  }
  if (typeof error === 'string') {
    return createError(
      {
        message: error,
      },
      fallback,
    )
  }
  if (error instanceof Error) {
    const appError = error as AppErrorLike
    const statusCode = inferStatusCode(appError, fallback.statusCode)
    return createError(
      {
        message:
          appError.message || fallback.message || getStatusText(statusCode),
        userMessage:
          extractUserMessage(appError.userMessage) ?? fallback.userMessage,
        statusCode,
        errorCode:
          extractErrorCode(appError.errorCode) ??
          extractErrorCode(appError.code) ??
          fallback.errorCode,
        expose:
          typeof appError.expose === 'boolean'
            ? appError.expose
            : fallback.expose,
        details: appError.details ?? fallback.details,
        retryable:
          typeof appError.retryable === 'boolean'
            ? appError.retryable
            : fallback.retryable,
        cause: appError.cause ?? fallback.cause,
        meta: isRecord(appError.meta)
          ? (appError.meta as Record<string, unknown>)
          : fallback.meta,
        tarpit: appError.tarpit ?? fallback.tarpit,
      },
      {
        ...fallback,
        statusCode,
      },
    )
  }
  return createError(
    {
      message:
        fallback.message ??
        getStatusText(fallback.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR),
    },
    fallback,
  )
}

export const serializeError = (
  error: unknown,
  options: {
    redactInternalMessage?: boolean
    includeDetails?: boolean
    includeMeta?: boolean
    includeStackLines?: boolean
  } = {},
): SerializedAppError => {
  const appError = toAppError(error)
  const status = getStatusText(appError.statusCode)
  const shouldRedact =
    options.redactInternalMessage &&
    appError.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR &&
    !appError.expose
  return {
    type: 'app_error',
    name: 'AppError',
    message: shouldRedact ? status : appError.message || status,
    userMessage: appError.userMessage,
    statusCode: appError.statusCode,
    code: appError.statusCode,
    status,
    errorCode: appError.errorCode,
    expose: appError.expose,
    retryable: appError.retryable,
    details: options.includeDetails ? appError.details : undefined,
    meta: options.includeMeta ? appError.meta : undefined,
    lines:
      options.includeStackLines && typeof appError.stack === 'string'
        ? appError.stack.split('\n').map((line) => line.trim())
        : undefined,
  }
}

export const deserializeError = (
  error: unknown,
  fallback: Omit<AppErrorOptions, 'message'> & {message?: string} = {},
) => {
  return isSerializedAppError(error)
    ? toAppError(error, fallback)
    : toAppError(error, fallback)
}

export const getErrorMessage = (
  error: unknown,
  fallback: string = 'An error occurred.',
) => toAppError(error, {message: fallback}).message || fallback

export const getUserErrorMessage = (
  error: unknown,
  fallback: string = INTERNAL_USER_MESSAGE,
) =>
  toAppError(error, {message: fallback, userMessage: fallback}).userMessage ||
  fallback

export const getErrorStatusCode = (
  error: unknown,
  fallback: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
) => toAppError(error, {statusCode: fallback}).statusCode

export const hasErrorCode = (error: unknown, expected: string | string[]) => {
  const actual = toAppError(error).errorCode
  return Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected
}

export const hasStatusCode = (error: unknown, expected: number | number[]) => {
  const actual = toAppError(error).statusCode
  return Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected
}
