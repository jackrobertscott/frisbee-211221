import {StatusCodes} from 'http-status-codes'
import {RequestHandler} from 'micro'
import config from '../config'
import endpoints from '../endpoints'
import intrusion from './intrusion'
/**
 *
 */
export default (handler: RequestHandler): RequestHandler => {
  /**
   *
   */
  return async (req, res) => {
    if (req.method === 'OPTIONS') return {}

    const pathname = intrusion.getPathname(req.url)

    switch (pathname) {
      case '/':
        return {
          env: config.env,
          now: new Date().toISOString(),
        }
      case '/robots.txt':
        return null
      case '/favicon.ico':
        return null
    }

    const knownRoute = endpoints.has(pathname)

    // check origin host of request
    const origin =
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    const threat = intrusion.inspect(req, {
      pathname,
      knownRoute,
      originAllowed: Boolean(origin && config.urlClient.startsWith(origin)),
      origin,
    })
    if (threat) throw threat

    if (!knownRoute) {
      const e: any = new Error('Not found.')
      e.statusCode = StatusCodes.NOT_FOUND
      throw e
    }

    if (req.method !== 'POST') {
      const e: any = new Error('Server only accepts POST requests.')
      e.statusCode = StatusCodes.METHOD_NOT_ALLOWED
      throw e
    }

    return handler(req, res)
  }
}
