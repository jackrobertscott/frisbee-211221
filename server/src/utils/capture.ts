import * as Sentry from '@sentry/node'
import {sentenceCase} from 'change-case'
import {IncomingMessage} from 'http'
import {StatusCodes, getReasonPhrase} from 'http-status-codes'
import {RequestHandler, send} from 'micro'
import config from '../config'
import tarpit from './tarpit'

Sentry.init({
  dsn: config.sentryDSN,
})

export default {
  shouldLogDebug(error: unknown) {
    if (!(error instanceof Error)) return true
    const statusCode = (error as any).statusCode
    if (statusCode === StatusCodes.NOT_FOUND) return false
    return true
  },

  formatLogLine(pretty: {code: number; status: string; message: string; url?: string}, req?: IncomingMessage) {
    const parts = [
      '[error]',
      String(pretty.code),
      pretty.status || 'Unknown',
      req?.method || 'UNKNOWN',
      pretty.url || req?.url || '/',
    ]
    const message = String(pretty.message || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (message) parts.push(message)
    return parts.join(' | ')
  },

  handle(handler: RequestHandler): RequestHandler {
    return async (req, res) => {
      try {
        const data = await handler(req, res)
        if (typeof data !== 'object' && !Array.isArray(data)) {
          const message = `Request handler may only return an object or an array but got ${typeof data}.`
          throw new Error(message)
        }
        return data
      } catch (error) {
        if (
          error instanceof Error &&
          typeof (error as any).tarpit === 'object' &&
          (error as any).tarpit
        ) {
          if (config.debug && this.shouldLogDebug(error)) {
            const pretty = this.pretty(error, req)
            console.log(this.formatLogLine(pretty, req))
          }
          await tarpit.respond(res, (error as any).tarpit)
          return null
        }

        if (
          error instanceof Error &&
          (error as any).statusCode === StatusCodes.FORBIDDEN
        ) {
          if (config.debug) {
            const pretty = this.pretty(error, req)
            console.log(this.formatLogLine(pretty, req))
          }
          return send(res, StatusCodes.FORBIDDEN)
        }

        if (typeof error === 'string') {
          error = new Error(error)
        }

        const pretty = this.pretty(error, req)
        if (config.debug && this.shouldLogDebug(error)) {
          console.log(this.formatLogLine(pretty, req))
        }
        if (pretty.code === StatusCodes.INTERNAL_SERVER_ERROR) {
          if (req) this.scope(req)
          process.nextTick(() => Sentry.captureException(error))
        }
        send(res, pretty.code, pretty)
      }
    }
  },

  pretty(error: any = {}, req: IncomingMessage) {
    let code = error.statusCode || error.code
    code = code
      ? code
      : error.name === 'ValidationError'
      ? StatusCodes.UNPROCESSABLE_ENTITY
      : error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError' ||
        error.name === 'NotBeforeError'
      ? StatusCodes.UNAUTHORIZED
      : error.message === 'jwt expired'
      ? StatusCodes.UNAUTHORIZED
      : StatusCodes.INTERNAL_SERVER_ERROR
    let status: string = ''
    try {
      status = getReasonPhrase(code)
    } catch (e) {}
    const message =
      code === StatusCodes.UNPROCESSABLE_ENTITY
        ? sentenceCase(error.message).concat('.')
        : code >= StatusCodes.INTERNAL_SERVER_ERROR && !config.debug
        ? status || 'Internal Server Error'
        : error.message || status
    return {
      code,
      status,
      message,
      url: req.url,
      lines:
        config.debug &&
        typeof error.stack === 'string' &&
        error.stack.split('\n').map((i: string) => i.trim()),
    }
  },

  scope(req: IncomingMessage) {
    // Sentry.configureScope((scope: Sentry.Scope) => {
    //   scope.addEventProcessor(async (event: Sentry.Event) => {
    //     return Sentry.Handlers.parseRequest(event, req)
    //   })
    // })
  },
}
