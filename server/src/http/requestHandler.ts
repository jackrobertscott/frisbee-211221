import {internalError, notFoundError} from '@shared/errors'
import {RequestHandler} from 'micro'
import endpoints from '../endpoints'
import capture from './capture'
import cors from './cors'
import intrusion from './intrusion'
import prerequest from './prerequest'

/** The full request pipeline: CORS, error capture, request screening, then the endpoint. */
export const createRequestHandler = (): RequestHandler => {
  const handler: RequestHandler = async (req, res) => {
    if (!req.url)
      throw internalError('Request url required.', {
        errorCode: 'request.url_missing',
      })
    const pathname = intrusion.getPathname(req.url)
    if (endpoints.has(pathname))
      // return "null" instead of "undefined" to end request
      return (await endpoints.get(pathname)!(req, res)) ?? null
    throw notFoundError(`Url ${req.url} is not supported.`, {
      errorCode: 'request.route_not_found',
    })
  }
  return cors()(capture.handle(prerequest(handler)))
}
