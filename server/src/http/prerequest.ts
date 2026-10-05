import {methodNotAllowedError, notFoundError} from '@shared/errors'
import {RequestHandler} from 'micro'
import config from '../config'
import endpoints from '../endpoints'
import intrusion from './intrusion'
import {origin} from './origin'

export default (handler: RequestHandler): RequestHandler => {
  return async (req, res) => {
    if (req.method === 'OPTIONS') return {}

    const pathname = intrusion.getPathname(req.url)

    switch (pathname) {
      case '/':
        return {
          env: config.IS_PRODUCTION ? 'production' : 'development',
          now: new Date().toISOString(),
        }
      case '/health':
        return {
          ok: true,
          now: new Date().toISOString(),
        }
      case '/robots.txt':
        return null
      case '/favicon.ico':
        return null
    }

    const knownRoute = endpoints.has(pathname)

    // check origin host of request
    const requestOrigin =
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    const threat = intrusion.inspect(req, {
      pathname,
      knownRoute,
      originAllowed: origin.isAllowed(requestOrigin),
      origin: requestOrigin,
    })
    if (threat) throw threat

    if (!knownRoute) {
      throw notFoundError('Not found.', {
        errorCode: 'request.route_not_found',
      })
    }

    if (req.method !== 'POST') {
      throw methodNotAllowedError('Server only accepts POST requests.', {
        errorCode: 'request.method_not_allowed',
      })
    }

    return handler(req, res)
  }
}
