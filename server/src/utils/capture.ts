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
import tarpit, {ITarpitPlan} from './tarpit'

const isTarpitPlan = (value: unknown): value is ITarpitPlan => {
  if (typeof value !== 'object' || value === null) return false
  const plan = value as Partial<ITarpitPlan>
  return (
    typeof plan.body === 'string' &&
    typeof plan.dripIntervalMs === 'number' &&
    typeof plan.holdMs === 'number' &&
    typeof plan.statusCode === 'number'
  )
}

export default {
  shouldLogError(error: unknown) {
    const statusCode = getErrorStatusCode(error)
    if (statusCode === HTTP_STATUS.NOT_FOUND) return false
    if (config.IS_PRODUCTION) return true
    return true
  },

  formatLogLine(
    pretty: {statusCode: number; status: string; message: string; url?: string},
    req?: IncomingMessage,
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
        if (isTarpitPlan(appError.tarpit)) {
          if (this.shouldLogError(error)) {
            const pretty = this.pretty(error, req)
            console.error(this.formatLogLine(pretty, req), error)
          }
          await tarpit.respond(res, appError.tarpit)
          return null
        }

        const pretty = this.pretty(error, req)
        if (this.shouldLogError(error)) {
          console.error(this.formatLogLine(pretty, req), error)
        }
        send(res, pretty.statusCode, pretty)
      }
    }
  },

  pretty(error: unknown, req: IncomingMessage) {
    const includeDebugDetails = !config.IS_PRODUCTION
    const pretty = serializeError(error, {
      redactInternalMessage: config.IS_PRODUCTION,
      includeDetails: includeDebugDetails,
      includeMeta: includeDebugDetails,
      includeStackLines: includeDebugDetails,
    })
    return {
      ...pretty,
      url: req.url,
    }
  },
}
