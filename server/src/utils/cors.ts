import {IncomingMessage} from 'http'
import {RequestHandler} from 'micro'
import {origin} from './origin'
/**
 *
 */
export interface ICorsOptions {
  origin?: string
  age?: string
}
/**
 *
 */
export default (options?: ICorsOptions) => {
  /**
   *
   */
  return (handler: RequestHandler): RequestHandler => {
    return (req, res) => {
      attachCorsToResponse(req, res, options)
      return handler(req, res)
    }
  }
}

export const attachCorsToResponse = (
  req: IncomingMessage,
  res: Parameters<RequestHandler>[1],
  options?: ICorsOptions
) => {
  const allowedAge = 60 * 60 * 24 // 24 hours
  const allowedMethods = ['POST', 'OPTIONS']
  const allowedHeaders = [
    'Access-Control-Allow-Origin',
    'Content-Type',
    'Authorization',
    'Accept',
  ]
  const requestOrigin =
    typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  const allowedOrigin = options?.origin ?? origin.allowed()
  if (origin.isAllowed(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin!)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  } else if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(','))
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(','))
  res.setHeader('Access-Control-Max-Age', String(allowedAge))
}
