import {
  badRequestError,
  forbiddenError,
  validationError,
} from '@shared/errors'
import {json, RequestHandler} from 'micro'
import {TypeIoAll, TypeIoValue} from 'torva'
import {origin} from './origin'

export const createEndpoint = <P extends TypeIoAll>({
  path,
  payload,
  unsafe,
  multipart,
  handler,
}: {
  path: string
  payload?: P
  unsafe?: boolean
  multipart?: boolean
  handler: (body: TypeIoValue<P>) => RequestHandler
}): [string, RequestHandler] => {
  return [
    path,
    async (req, res) => {
      const requestOrigin =
        typeof req.headers.origin === 'string' ? req.headers.origin : undefined
      if (!unsafe && !origin.isAllowed(requestOrigin)) {
        throw forbiddenError('Request origin not valid.', {
          errorCode: 'request.origin_invalid',
        })
      }
      const body: any = multipart ? {} : await json(req)
      let result: any
      if (payload) {
        if (!('payload' in body))
          throw badRequestError('Body missing payload.', {
            errorCode: 'request.payload_missing',
          })
        const data = payload.validate(body.payload)
        if (!data.ok) {
          console.log(data)
          let prettyError: string | undefined
          if (data.error?.includes(':')) {
            const [first, ...rest] = data.error.split(':')
            prettyError = first
              ?.replace('[', '')
              .replace(']', '')
              .concat(' ')
              .concat(rest?.join('').trim().toLowerCase())
          }
          if (prettyError) prettyError = `An error occurred: ${prettyError}`
          throw validationError(prettyError ?? `The input provided is invalid.`, {
            details: data.error,
          })
        }
        result = data.value
      }
      return handler(result)(req, res)
    },
  ]
}
