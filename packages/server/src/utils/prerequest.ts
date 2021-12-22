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
          now: Date.now(),
        }
      case '/robots.txt':
        return null
      case '/favicon.ico':
        return null
    }
    if (req.method !== 'POST')
      throw new Error('Server only accepts POST requests.')
    return handler(req, res)
  }
}
