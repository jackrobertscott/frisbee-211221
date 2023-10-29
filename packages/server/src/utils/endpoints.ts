import {json, RequestHandler} from 'micro'
import {TypeIoAll, TypeIoValue} from 'torva'
import config from '../config'
/**
 *
 */
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
      if (!unsafe && req.headers.origin !== config.urlClient)
        throw new Error('Request origin not valid.')
      const body: any = multipart ? {} : await json(req)
      let result: any
      if (payload) {
        if (!('payload' in body)) throw new Error('Body missing payload.')
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
          throw new Error(prettyError ?? `The input provided is invalid.`)
        }
        result = data.value
      }
      return handler(result)(req, res)
    },
  ]
}
