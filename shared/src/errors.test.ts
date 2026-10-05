import {describe, expect, it} from 'vitest'
import {
  AppError,
  badRequestError,
  conflictError,
  createError,
  deserializeError,
  forbiddenError,
  getErrorStatusCode,
  getUserErrorMessage,
  getValidationUserMessage,
  hasStatusCode,
  HTTP_STATUS,
  internalError,
  isAppError,
  isSerializedAppError,
  methodNotAllowedError,
  notFoundError,
  serializeError,
  serviceUnavailableError,
  toAppError,
  tooManyRequestsError,
  unauthorizedError,
  validationError,
} from './errors'

const INTERNAL =
  'Something went wrong while completing your request. Please try again in a moment.'

const errorWith = (message: string, props: Record<string, unknown>) =>
  Object.assign(new Error(message), props)

describe('AppError', () => {
  it('defaults to an unexposed internal error', () => {
    const error = new AppError({message: 'boom'})
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
    expect(error.name).toBe('AppError')
    expect(error.message).toBe('boom')
    expect(error.statusCode).toBe(500)
    expect(error.errorCode).toBe('internal_error')
    expect(error.expose).toBe(false)
    expect(error.retryable).toBe(false)
    expect(error.userMessage).toBe(INTERNAL)
    expect(error.details).toBeUndefined()
    expect(error.meta).toBeUndefined()
  })

  it('derives error code and exposure from status code', () => {
    const cases: Array<[number, string, boolean]> = [
      [400, 'bad_request', true],
      [401, 'unauthorized', true],
      [403, 'forbidden', true],
      [404, 'not_found', true],
      [405, 'method_not_allowed', true],
      [409, 'conflict', true],
      [422, 'validation_error', true],
      [429, 'too_many_requests', true],
      [503, 'service_unavailable', false],
      [418, 'internal_error', true],
    ]
    for (const [statusCode, errorCode, expose] of cases) {
      const error = new AppError({message: 'x', statusCode})
      expect(error.errorCode).toBe(errorCode)
      expect(error.expose).toBe(expose)
    }
  })

  it('uses explicit user messages, collapsing whitespace', () => {
    const error = new AppError({
      message: 'x',
      userMessage: '  Hello\n   there  ',
    })
    expect(error.userMessage).toBe('Hello there')
  })

  it('ignores a whitespace-only user message', () => {
    const error = new AppError({message: 'x', userMessage: '   '})
    expect(error.userMessage).toBe(INTERNAL)
  })

  it('maps known error codes to user messages', () => {
    expect(
      new AppError({
        message: 'x',
        statusCode: 401,
        errorCode: 'auth.invalid_login',
      }).userMessage,
    ).toBe('The email or password is not correct.')
    expect(
      new AppError({
        message: 'x',
        statusCode: 400,
        errorCode: 'user.code_invalid',
      }).userMessage,
    ).toBe('That code is not correct.')
  })

  it('uses a cleaned exposed message for unknown codes below 500', () => {
    const error = new AppError({
      message: 'Failed:   Team can not   be saved',
      statusCode: 400,
      errorCode: 'custom.thing',
    })
    expect(error.userMessage).toBe('Team cannot be saved')
    expect(
      new AppError({
        message: 'An error occurred: oops',
        statusCode: 400,
        errorCode: 'custom.thing',
      }).userMessage,
    ).toBe('oops')
  })

  it('falls back to the status message for unexposed or empty messages', () => {
    expect(
      new AppError({
        message: 'secret',
        statusCode: 404,
        errorCode: 'custom.thing',
        expose: false,
      }).userMessage,
    ).toBe('We could not find what you were looking for.')
    expect(
      new AppError({
        message: 'failed:',
        statusCode: 403,
        errorCode: 'custom.thing',
      }).userMessage,
    ).toBe('You do not have permission to do that.')
    expect(
      new AppError({
        message: 'x',
        statusCode: 418,
        errorCode: 'custom.thing',
        expose: false,
      }).userMessage,
    ).toBe(INTERNAL)
  })

  it('never uses the raw message for 5xx errors, even when exposed', () => {
    expect(
      new AppError({
        message: 'db down',
        statusCode: 503,
        errorCode: 'custom.thing',
        expose: true,
      }).userMessage,
    ).toBe('This feature is temporarily unavailable. Please try again later.')
  })

  it('keeps optional fields', () => {
    const cause = new Error('root')
    const error = new AppError({
      message: 'x',
      details: {a: 1},
      retryable: true,
      cause,
      meta: {b: 2},
      tarpit: {holdMs: 1},
    })
    expect(error.details).toEqual({a: 1})
    expect(error.retryable).toBe(true)
    expect(error.cause).toBe(cause)
    expect(error.meta).toEqual({b: 2})
    expect(error.tarpit).toEqual({holdMs: 1})
  })
})

describe('error factories', () => {
  it('create errors with fixed status and code', () => {
    const cases: Array<[AppError, number, string, string]> = [
      [
        badRequestError('x'),
        400,
        'bad_request',
        'Please check the information you entered and try again.',
      ],
      [
        unauthorizedError('x'),
        401,
        'unauthorized',
        'Please sign in to continue.',
      ],
      [
        forbiddenError('x'),
        403,
        'forbidden',
        'You do not have permission to do that.',
      ],
      [
        notFoundError('x'),
        404,
        'not_found',
        'We could not find what you were looking for.',
      ],
      [
        methodNotAllowedError('x'),
        405,
        'method_not_allowed',
        'This action is not available from here.',
      ],
      [
        conflictError('x'),
        409,
        'conflict',
        'That change could not be saved because it conflicts with existing information.',
      ],
      [
        validationError('x'),
        422,
        'validation_error',
        'Please check the information you entered and try again.',
      ],
      [
        tooManyRequestsError('x'),
        429,
        'too_many_requests',
        'Too many attempts were made. Please wait a little while before trying again.',
      ],
      [
        serviceUnavailableError('x'),
        503,
        'service_unavailable',
        'This feature is temporarily unavailable. Please try again later.',
      ],
    ]
    for (const [error, statusCode, errorCode, userMessage] of cases) {
      expect(error).toBeInstanceOf(AppError)
      expect(error.message).toBe('x')
      expect(error.statusCode).toBe(statusCode)
      expect(error.errorCode).toBe(errorCode)
      expect(error.userMessage).toBe(userMessage)
      expect(error.expose).toBe(statusCode < 500)
    }
  })

  it('accept an overriding error code', () => {
    const error = badRequestError('Bad team', {errorCode: 'team.custom'})
    expect(error.errorCode).toBe('team.custom')
    expect(error.userMessage).toBe('Bad team')
    expect(
      forbiddenError('x', {errorCode: 'team.captain_required'}).userMessage,
    ).toBe('Only a team captain can do that.')
  })

  it('internalError defaults its message and is never exposed', () => {
    const error = internalError()
    expect(error.message).toBe('Internal Server Error')
    expect(error.statusCode).toBe(500)
    expect(error.errorCode).toBe('internal_error')
    expect(error.expose).toBe(false)
    expect(error.userMessage).toBe(INTERNAL)
  })

  it('internalError accepts a custom error code', () => {
    const error = internalError('missing', {errorCode: 'db.record_not_found'})
    expect(error.statusCode).toBe(500)
    expect(error.errorCode).toBe('db.record_not_found')
    expect(error.userMessage).toBe(
      'We could not find the item you were trying to open.',
    )
  })

  it('createError merges overrides over base options', () => {
    const error = createError(
      {message: 'base', statusCode: 400, errorCode: 'bad_request'},
      {message: 'override', statusCode: 404},
    )
    expect(error.message).toBe('override')
    expect(error.statusCode).toBe(404)
    expect(error.errorCode).toBe('bad_request')
    const fromString = createError('plain', {statusCode: 409})
    expect(fromString.message).toBe('plain')
    expect(fromString.errorCode).toBe('conflict')
    expect(fromString.expose).toBe(true)
  })
})

describe('validation user messages', () => {
  it('humanises the field named in validation details', () => {
    const cases: Array<[string, string]> = [
      ['[email]: Value is not a valid email.', 'email address'],
      ['[teamAgainstId]: ID can not be empty.', 'opposition team'],
      ['[roundCount]: Value is not a number.', 'number of rounds'],
      ['[homeTeamId]: x', 'home team'],
      ['[some_field-name]: x', 'some field name'],
      ['[user.firstName]: x', 'first name'],
      ['[list]: [1]: [id]: x', 'list'],
      ['[spiritP1]: x', 'spirit p1'],
    ]
    for (const [details, field] of cases) {
      expect(getValidationUserMessage(details)).toBe(
        `Please check ${field} and try again.`,
      )
    }
  })

  it('falls back to the generic message without a field', () => {
    const generic = 'Please check the information you entered and try again.'
    expect(getValidationUserMessage(undefined)).toBe(generic)
    expect(getValidationUserMessage('no field here')).toBe(generic)
    expect(getValidationUserMessage({field: 'email'})).toBe(generic)
  })

  it('is used for validation_error AppErrors', () => {
    const error = validationError('[firstName]: Value can not be empty.', {
      details: '[firstName]: Value can not be empty.',
    })
    expect(error.userMessage).toBe('Please check first name and try again.')
    // the message itself is not inspected, only details
    expect(validationError('[firstName]: x').userMessage).toBe(
      'Please check the information you entered and try again.',
    )
  })
})

describe('isAppError / isSerializedAppError', () => {
  it('detects AppError instances', () => {
    expect(isAppError(notFoundError('x'))).toBe(true)
    expect(isAppError(new Error('x'))).toBe(false)
    expect(isAppError(serializeError(notFoundError('x')))).toBe(false)
  })

  it('detects serialized errors', () => {
    expect(isSerializedAppError(serializeError(notFoundError('x')))).toBe(true)
    expect(
      isSerializedAppError({
        name: 'AppError',
        message: 'x',
        errorCode: 'x',
        expose: true,
        retryable: false,
        code: '404',
      }),
    ).toBe(true)
    expect(
      isSerializedAppError({
        type: 'app_error',
        message: 'x',
        errorCode: 'x',
        expose: true,
        retryable: false,
        statusCode: 200,
      }),
    ).toBe(false)
    expect(
      isSerializedAppError({
        type: 'app_error',
        message: 'x',
        errorCode: 'x',
        expose: true,
        statusCode: 404,
      }),
    ).toBe(false)
    expect(isSerializedAppError(null)).toBe(false)
    expect(isSerializedAppError('x')).toBe(false)
  })
})

describe('toAppError', () => {
  it('returns AppErrors unchanged', () => {
    const error = notFoundError('x')
    expect(toAppError(error)).toBe(error)
  })

  it('wraps strings as internal errors', () => {
    const error = toAppError('oops')
    expect(error.message).toBe('oops')
    expect(error.statusCode).toBe(500)
    expect(error.errorCode).toBe('internal_error')
    expect(error.expose).toBe(false)
  })

  it('applies fallback options to strings', () => {
    const error = toAppError('oops', {statusCode: 400})
    expect(error.statusCode).toBe(400)
    expect(error.errorCode).toBe('bad_request')
    expect(error.expose).toBe(true)
  })

  it('wraps plain Errors as internal errors', () => {
    const cause = new Error('boom')
    const error = toAppError(cause)
    expect(error.message).toBe('boom')
    expect(error.statusCode).toBe(500)
    expect(error.errorCode).toBe('internal_error')
    expect(error.expose).toBe(false)
    expect(error.userMessage).toBe(INTERNAL)
  })

  it('reads status codes from statusCode or numeric code', () => {
    expect(toAppError(errorWith('x', {statusCode: 404})).statusCode).toBe(404)
    expect(toAppError(errorWith('x', {statusCode: '403'})).statusCode).toBe(403)
    const fromCode = toAppError(errorWith('x', {code: '409'}))
    expect(fromCode.statusCode).toBe(409)
    expect(fromCode.errorCode).toBe('conflict')
    expect(toAppError(errorWith('x', {statusCode: 200})).statusCode).toBe(500)
  })

  it('uses a string code as the error code', () => {
    const error = toAppError(
      errorWith('connect failed', {code: 'ECONNREFUSED'}),
    )
    expect(error.statusCode).toBe(500)
    expect(error.errorCode).toBe('ECONNREFUSED')
    expect(error.userMessage).toBe(INTERNAL)
  })

  it('prefers errorCode over code', () => {
    const error = toAppError(
      errorWith('x', {
        statusCode: 401,
        errorCode: 'auth.invalid_login',
        code: 'E',
      }),
    )
    expect(error.errorCode).toBe('auth.invalid_login')
    expect(error.userMessage).toBe('The email or password is not correct.')
  })

  it('maps ValidationError to 422', () => {
    const error = new Error('bad')
    error.name = 'ValidationError'
    const appError = toAppError(error)
    expect(appError.statusCode).toBe(422)
    expect(appError.errorCode).toBe('validation_error')
  })

  it('maps JWT errors to 401', () => {
    for (const name of [
      'JsonWebTokenError',
      'TokenExpiredError',
      'NotBeforeError',
    ]) {
      const error = new Error('jwt problem')
      error.name = name
      const appError = toAppError(error)
      expect(appError.statusCode).toBe(401)
      expect(appError.errorCode).toBe('unauthorized')
      expect(appError.userMessage).toBe('Please sign in to continue.')
    }
    expect(toAppError(new Error('jwt expired')).statusCode).toBe(401)
  })

  it('copies known properties from Error-like objects', () => {
    const cause = new Error('root')
    const error = toAppError(
      errorWith('x', {
        statusCode: 400,
        userMessage: 'Custom message',
        expose: false,
        details: {a: 1},
        retryable: true,
        cause,
        meta: {b: 2},
        tarpit: {holdMs: 5},
      }),
    )
    expect(error.userMessage).toBe('Custom message')
    expect(error.expose).toBe(false)
    expect(error.details).toEqual({a: 1})
    expect(error.retryable).toBe(true)
    expect(error.cause).toBe(cause)
    expect(error.meta).toEqual({b: 2})
    expect(error.tarpit).toEqual({holdMs: 5})
  })

  it('uses fallback options for Errors where not specified', () => {
    const error = toAppError(errorWith('x', {meta: 'not a record'}), {
      statusCode: 503,
      meta: {fallback: true},
      retryable: true,
    })
    expect(error.statusCode).toBe(503)
    expect(error.errorCode).toBe('service_unavailable')
    expect(error.meta).toEqual({fallback: true})
    expect(error.retryable).toBe(true)
  })

  it('keeps the Error own properties over fallback options', () => {
    const error = toAppError(
      errorWith('own message', {
        statusCode: 400,
        errorCode: 'own.code',
        userMessage: 'Own',
      }),
      {
        message: 'fallback',
        errorCode: 'fallback.code',
        userMessage: 'Fallback',
      },
    )
    expect(error.message).toBe('own message')
    expect(error.errorCode).toBe('own.code')
    expect(error.userMessage).toBe('Own')
    expect(error.statusCode).toBe(400)
  })

  it('prefers the error status code over the fallback', () => {
    expect(
      toAppError(errorWith('x', {statusCode: 404}), {statusCode: 503})
        .statusCode,
    ).toBe(404)
  })

  it('fills in an empty Error message', () => {
    expect(toAppError(new Error('')).message).toBe('Internal Server Error')
    expect(toAppError(new Error(''), {message: 'fallback'}).message).toBe(
      'fallback',
    )
  })

  it('handles unknown values', () => {
    for (const value of [undefined, null, 42, {foo: 'bar'}]) {
      const error = toAppError(value)
      expect(error.statusCode).toBe(500)
      expect(error.message).toBe('Internal Server Error')
    }
    const withFallback = toAppError(undefined, {statusCode: 404})
    expect(withFallback.statusCode).toBe(404)
    expect(withFallback.message).toBe('Not Found')
    expect(toAppError(undefined, {message: 'custom'}).message).toBe('custom')
  })

  it('round-trips serialized errors', () => {
    const original = forbiddenError('nope', {
      errorCode: 'team.access_forbidden',
      details: {x: 1},
      meta: {y: 2},
      retryable: true,
    })
    const restored = deserializeError(
      serializeError(original, {includeDetails: true, includeMeta: true}),
    )
    expect(restored).toBeInstanceOf(AppError)
    expect(restored.message).toBe('nope')
    expect(restored.statusCode).toBe(403)
    expect(restored.errorCode).toBe('team.access_forbidden')
    expect(restored.userMessage).toBe('You do not have access to that team.')
    expect(restored.retryable).toBe(true)
    expect(restored.details).toEqual({x: 1})
    expect(restored.meta).toEqual({y: 2})
  })

  it('reads `code` when restoring a serialized error that lacks statusCode', () => {
    const restored = toAppError({
      name: 'AppError',
      message: 'gone',
      errorCode: 'not_found',
      expose: true,
      retryable: false,
      code: 404,
    })
    expect(restored.statusCode).toBe(404)
    expect(restored.errorCode).toBe('not_found')
    expect(restored.message).toBe('gone')
  })
})

describe('serializeError', () => {
  it('serializes the public shape', () => {
    const serialized = serializeError(notFoundError('missing'))
    expect(serialized).toEqual({
      type: 'app_error',
      name: 'AppError',
      message: 'missing',
      userMessage: 'We could not find what you were looking for.',
      statusCode: 404,
      code: 404,
      status: 'Not Found',
      errorCode: 'not_found',
      expose: true,
      retryable: false,
      details: undefined,
      meta: undefined,
      lines: undefined,
    })
  })

  it('redacts unexposed 5xx messages only when asked', () => {
    const error = internalError('secret database detail')
    expect(serializeError(error).message).toBe('secret database detail')
    expect(serializeError(error, {redactInternalMessage: true}).message).toBe(
      'Internal Server Error',
    )
    expect(
      serializeError(
        createError({message: 'visible', statusCode: 500, expose: true}),
        {redactInternalMessage: true},
      ).message,
    ).toBe('visible')
    expect(
      serializeError(badRequestError('visible'), {redactInternalMessage: true})
        .message,
    ).toBe('visible')
    expect(
      serializeError(serviceUnavailableError('down'), {
        redactInternalMessage: true,
      }).message,
    ).toBe('Service Unavailable')
  })

  it('includes details, meta and stack lines only when asked', () => {
    const error = badRequestError('x', {details: {a: 1}, meta: {b: 2}})
    const plain = serializeError(error)
    expect(plain.details).toBeUndefined()
    expect(plain.meta).toBeUndefined()
    expect(plain.lines).toBeUndefined()
    const full = serializeError(error, {
      includeDetails: true,
      includeMeta: true,
      includeStackLines: true,
    })
    expect(full.details).toEqual({a: 1})
    expect(full.meta).toEqual({b: 2})
    expect(Array.isArray(full.lines)).toBe(true)
    expect(full.lines?.[0]).toBe('AppError: x')
  })

  it('uses the internal status text for unknown status codes', () => {
    const serialized = serializeError(
      new AppError({message: 'x', statusCode: 418}),
    )
    expect(serialized.status).toBe('Internal Server Error')
    expect(serialized.statusCode).toBe(418)
  })

  it('serializes non-AppErrors via toAppError', () => {
    const serialized = serializeError('plain string')
    expect(serialized.statusCode).toBe(500)
    expect(serialized.message).toBe('plain string')
  })
})

describe('getUserErrorMessage', () => {
  it('returns the AppError user message', () => {
    expect(getUserErrorMessage(notFoundError('x'))).toBe(
      'We could not find what you were looking for.',
    )
    expect(
      getUserErrorMessage(
        validationError('x', {
          details: '[startingDate]: Value is not a valid date string.',
        }),
      ),
    ).toBe('Please check starting date and try again.')
  })

  it('returns the user message of serialized errors', () => {
    expect(
      getUserErrorMessage(
        serializeError(badRequestError('x', {userMessage: 'Fix it'})),
      ),
    ).toBe('Fix it')
  })

  it('returns the fallback for strings and plain Errors', () => {
    expect(getUserErrorMessage('oops')).toBe(INTERNAL)
    expect(getUserErrorMessage(new Error('boom'))).toBe(INTERNAL)
    expect(getUserErrorMessage(new Error('boom'), 'Custom')).toBe('Custom')
    expect(getUserErrorMessage(undefined, 'Custom')).toBe('Custom')
  })

  it('ignores the status code of plain Errors in favour of the fallback', () => {
    expect(getUserErrorMessage(errorWith('x', {statusCode: 404}))).toBe(
      INTERNAL,
    )
    // an Error's own userMessage still beats the fallback
    expect(getUserErrorMessage(errorWith('x', {userMessage: 'Own'}))).toBe(
      'Own',
    )
  })
})

describe('getErrorStatusCode / hasStatusCode', () => {
  it('reads status codes with a fallback', () => {
    expect(getErrorStatusCode(notFoundError('x'))).toBe(404)
    expect(getErrorStatusCode(new Error('x'))).toBe(500)
    expect(getErrorStatusCode(new Error('x'), 400)).toBe(400)
    expect(getErrorStatusCode('x', 400)).toBe(400)
  })

  it('compares against a single status or a list', () => {
    expect(hasStatusCode(notFoundError('x'), HTTP_STATUS.NOT_FOUND)).toBe(true)
    expect(hasStatusCode(notFoundError('x'), 400)).toBe(false)
    expect(hasStatusCode(notFoundError('x'), [400, 404])).toBe(true)
    expect(hasStatusCode(new Error('x'), 500)).toBe(true)
    expect(hasStatusCode(errorWith('x', {statusCode: 401}), [401])).toBe(true)
  })
})
