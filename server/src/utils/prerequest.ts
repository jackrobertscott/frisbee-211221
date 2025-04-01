import {StatusCodes} from 'http-status-codes'
import {RequestHandler} from 'micro'
import config from '../config'
/**
 *
 */
export default (handler: RequestHandler): RequestHandler => {
  /**
   *
   */
  return async (req, res) => {
    if (req.method === 'OPTIONS') return {}

    switch (req.url) {
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

    // check origin host of request
    const origin = req.headers.origin
    if (!origin || !config.urlClient.startsWith(origin)) {
      const e: any = new Error(
        `Forbidden origin "${origin}" attempted "${req.url}"`
      )
      e.statusCode = StatusCodes.FORBIDDEN
      throw e
    }

    if (req.method !== 'POST') {
      throw new Error('Server only accepts POST requests.')
    }

    return handler(req, res)
  }
}
