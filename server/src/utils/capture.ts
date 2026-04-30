import * as Sentry from '@sentry/node'
import {
  HTTP_STATUS,
  getErrorStatusCode,
  internalError,
  serializeError,
  toAppError,
} from '@shared/errors'
import {IncomingMessage} from 'http'
import {RequestHandler, send} from 'micro'
import config from '../config'
import tarpit from './tarpit'

Sentry.init({
  dsn: config.sentryDSN,
})

export default {
  shouldLogDebug(error: unknown) {
    if (getErrorStatusCode(error) === HTTP_STATUS.NOT_FOUND) return false
    return true
  },

  formatLogLine(
    pretty: {statusCode: number; status: string; message: string; url?: string},
    req?: IncomingMessage
  ) {
    const parts = [
      '[error]',
      String(pretty.statusCode),
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
          throw internalError(message, {
            errorCode: 'request.invalid_handler_response',
          })
        }
        return data
      } catch (error) {
        const appError = toAppError(error)
        if (typeof appError.tarpit === 'object' && appError.tarpit) {
          if (config.debug && this.shouldLogDebug(error)) {
            const pretty = this.pretty(error, req)
            console.log(this.formatLogLine(pretty, req))
          }
          await tarpit.respond(res, appError.tarpit as any)
          return null
        }

        const pretty = this.pretty(error, req)
        if (config.debug && this.shouldLogDebug(error)) {
          console.log(this.formatLogLine(pretty, req))
        }
        if (pretty.statusCode === HTTP_STATUS.INTERNAL_SERVER_ERROR) {
          if (req) this.scope(req)
          process.nextTick(() => Sentry.captureException(error))
        }
        send(res, pretty.statusCode, pretty)
      }
    }
  },

  pretty(error: unknown, req: IncomingMessage) {
    const pretty = serializeError(error, {
      redactInternalMessage: !config.debug,
      includeDetails: config.debug,
      includeMeta: config.debug,
      includeStackLines: config.debug,
    })
    return {
      ...pretty,
      url: req.url,
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
