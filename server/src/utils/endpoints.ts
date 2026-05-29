import {TAuthPoint} from '@shared/auth/authAccess'
import {
  badRequestError,
  forbiddenError,
  getValidationUserMessage,
  validationError,
} from '@shared/errors'
import {json, RequestHandler} from 'micro'
import {TypeIoAll, TypeIoValue} from '@shared/torva'
import {origin} from './origin'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const createEndpoint = <
  P extends TypeIoAll,
  A extends TAuthPoint | undefined,
>({
  access,
  path,
  payload,
  unsafe,
  multipart,
  handler,
}: {
  access?: A
  path: string
  payload?: P
  unsafe?: boolean
  multipart?: boolean
  handler: (body: TypeIoValue<P>, access: A) => RequestHandler
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
      const body: unknown = multipart ? {} : await json(req)
      let result: TypeIoValue<P> | undefined
      if (payload) {
        if (!isRecord(body) || !('payload' in body))
          throw badRequestError('Body missing payload.', {
            errorCode: 'request.payload_missing',
          })
        const data = payload.validate(body.payload as TypeIoValue<P>)
        if (!data.ok) {
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
          throw validationError(
            prettyError ?? `The input provided is invalid.`,
            {
              details: data.error,
              userMessage: getValidationUserMessage(data.error),
            },
          )
        }
        result = data.value
      }
      return handler(result as TypeIoValue<P>, access as A)(req, res)
    },
  ]
}
