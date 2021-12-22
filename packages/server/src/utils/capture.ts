import * as Sentry from '@sentry/node'
import {StatusCodes, getReasonPhrase} from 'http-status-codes'
import {IncomingMessage} from 'http'
import {send, RequestHandler} from 'micro'
import {sentenceCase} from 'change-case'
import config from '../config'
/**
 *
 */
Sentry.init({
  dsn: config.sentryDSN,
})
/**
 *
 */
export default {
  /**
   *
   */
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
        if (typeof error === 'string') error = new Error(error)
        const pretty = this.pretty(error, req)
        if (config.debug) console.log(pretty)
        if (pretty.code === StatusCodes.INTERNAL_SERVER_ERROR) {
          if (req) this.scope(req)
          process.nextTick(() => Sentry.captureException(error))
        }
        send(res, pretty.code, pretty)
      }
    }
  },
  /**
   *
   */
  pretty(error: any = {}, req: IncomingMessage) {
    let code = error.statusCode || error.code
    code = code
      ? code
      : error.name === 'ValidationError'
      ? StatusCodes.UNPROCESSABLE_ENTITY
      : error.message === 'jwt expired'
      ? 401
      : StatusCodes.INTERNAL_SERVER_ERROR
    let status: string = ''
    try {
      status = getReasonPhrase(code)
    } catch (e) {}
    return {
      code,
      status,
      message:
        code === StatusCodes.UNPROCESSABLE_ENTITY
          ? sentenceCase(error.message).concat('.') // { stripRegexp: /[_]+/gi } // strip underscores
          : error.message,
      url: req.url,
      lines:
        typeof error.stack === 'string' &&
        error.stack.split('\n').map((i: string) => i.trim()),
    }
  },
  /**
   *
   */
  scope(req: any) {
    Sentry.configureScope((scope: Sentry.Scope) => {
      scope.addEventProcessor(async (event: Sentry.Event) => {
        return Sentry.Handlers.parseRequest(event, req)
      })
    })
  },
}
