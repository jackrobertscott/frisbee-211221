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
          if (config.DEBUG && this.shouldLogDebug(error)) {
            const pretty = this.pretty(error, req)
            console.log(this.formatLogLine(pretty, req))
          }
          await tarpit.respond(res, appError.tarpit as any)
          return null
        }

        const pretty = this.pretty(error, req)
        if (config.DEBUG && this.shouldLogDebug(error)) {
          console.log(this.formatLogLine(pretty, req))
        }
        send(res, pretty.statusCode, pretty)
      }
    }
  },

  pretty(error: unknown, req: IncomingMessage) {
    const pretty = serializeError(error, {
      redactInternalMessage: !config.DEBUG,
      includeDetails: config.DEBUG,
      includeMeta: config.DEBUG,
      includeStackLines: config.DEBUG,
    })
    return {
      ...pretty,
      url: req.url,
    }
  },
}
