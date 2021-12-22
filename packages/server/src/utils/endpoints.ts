import config from '../config'
import {json, RequestHandler} from 'micro'
import {TioAll, TioValue} from 'torva'
/**
 *
 */
export const createEndpoint = <P extends TioAll>({
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
  handler: (body: TioValue<P>) => RequestHandler
}): [string, RequestHandler] => {
  return [
    path,
    async (req, res) => {
      if (!unsafe && req.headers.origin !== config.urlClient)
        throw new Error('Request origin not valid.')
      const body: {payload?: any} = multipart ? {} : await json(req)
      let result: any
      if (payload) {
        const data = payload.validate(body.payload)
        if (!data.ok) {
          console.log(data)
          let prettyError: string | undefined
          if (data.error?.includes(':')) {
            const i = data.error.split(':')
            prettyError = i[0]
              ?.replace('[', '')
              .replace(']', '')
              .concat(' ')
              .concat(i[1]?.trim().toLowerCase())
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
