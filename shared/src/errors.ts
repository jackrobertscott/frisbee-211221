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
  typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599

const getStatusText = (statusCode: number) =>
  STATUS_TEXT_BY_CODE[statusCode] ?? STATUS_TEXT_BY_CODE[HTTP_STATUS.INTERNAL_SERVER_ERROR]

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
    this.expose =
      options.expose ?? defaultExposeForStatus(this.statusCode)
    this.details = options.details
    this.retryable = options.retryable ?? false
    this.cause = options.cause
    this.meta = options.meta
    this.tarpit = options.tarpit
  }
}

export const createError = (
  options: string | AppErrorOptions,
  overrides: Omit<AppErrorOptions, 'message'> & {message?: string} = {}
) => {
  const base = typeof options === 'string' ? {message: options} : options
  const statusCode =
    overrides.statusCode ?? base.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR
  return new AppError({
    ...base,
    ...overrides,
    message: overrides.message ?? base.message,
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
    options: Omit<AppErrorOptions, 'message' | 'statusCode'> = {}
  ) =>
    createError({
      message,
      statusCode,
      errorCode,
      ...options,
    })

export const badRequestError = createStatusFactory(
  HTTP_STATUS.BAD_REQUEST,
  'bad_request'
)
export const unauthorizedError = createStatusFactory(
  HTTP_STATUS.UNAUTHORIZED,
  'unauthorized'
)
export const forbiddenError = createStatusFactory(
  HTTP_STATUS.FORBIDDEN,
  'forbidden'
)
export const notFoundError = createStatusFactory(
  HTTP_STATUS.NOT_FOUND,
  'not_found'
)
export const methodNotAllowedError = createStatusFactory(
  HTTP_STATUS.METHOD_NOT_ALLOWED,
  'method_not_allowed'
)
export const conflictError = createStatusFactory(
  HTTP_STATUS.CONFLICT,
  'conflict'
)
export const validationError = createStatusFactory(
  HTTP_STATUS.UNPROCESSABLE_ENTITY,
  'validation_error'
)
export const tooManyRequestsError = createStatusFactory(
  HTTP_STATUS.TOO_MANY_REQUESTS,
  'too_many_requests'
)
export const internalError = (
  message: string = getStatusText(HTTP_STATUS.INTERNAL_SERVER_ERROR),
  options: Omit<AppErrorOptions, 'message' | 'statusCode' | 'expose'> = {}
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
  'service_unavailable'
)

export const unreachableError = (
  message: string = 'Unreachable code path.'
): never => {
  throw internalError(message, {errorCode: 'unreachable'})
}

export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError
}

export const isSerializedAppError = (
  error: unknown
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
  fallback: Omit<AppErrorOptions, 'message'> & {message?: string} = {}
) => {
  if (isAppError(error)) return error
  if (isSerializedAppError(error)) {
    return createError({
      message: error.message,
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
      fallback
    )
  }
  if (error instanceof Error) {
    const appError = error as AppErrorLike
    const statusCode = inferStatusCode(appError, fallback.statusCode)
    return createError(
      {
        message: appError.message || fallback.message || getStatusText(statusCode),
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
      }
    )
  }
  return createError(
    {
      message: fallback.message ?? getStatusText(fallback.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR),
    },
    fallback
  )
}

export const serializeError = (
  error: unknown,
  options: {
    redactInternalMessage?: boolean
    includeDetails?: boolean
    includeMeta?: boolean
    includeStackLines?: boolean
  } = {}
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
  fallback: Omit<AppErrorOptions, 'message'> & {message?: string} = {}
) => {
  return isSerializedAppError(error) ? toAppError(error, fallback) : toAppError(error, fallback)
}

export const getErrorMessage = (
  error: unknown,
  fallback: string = 'An error occurred.'
) => toAppError(error, {message: fallback}).message || fallback

export const getErrorStatusCode = (
  error: unknown,
  fallback: number = HTTP_STATUS.INTERNAL_SERVER_ERROR
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
