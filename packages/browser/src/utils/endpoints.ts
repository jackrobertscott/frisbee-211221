import {TypeIoAll, TypeIoValue} from 'torva'
import {radio} from './radio'
/**
 *
 */
export interface TEndpoint<
  I extends TypeIoAll,
  O extends TypeIoAll,
  M extends boolean
> {
  readonly IN?: I
  readonly OUT?: O
  fetch(
    payload?: M extends true ? FormData : TypeIoValue<I>,
    token?: string
  ): Promise<TypeIoValue<O>>
}
/**
 *
 */
export const createEndpoint = <
  I extends TypeIoAll,
  O extends TypeIoAll,
  M extends boolean
>(options: {
  path: string
  multipart?: M
  payload?: M extends true ? undefined : I
  result?: O
}): TEndpoint<I, O, M> => {
  return {
    async fetch(payload, token) {
      if (options.multipart)
        return radio.multipart(options.path, payload as FormData, token)
      return radio.send(options.path, payload, token)
    },
  }
}
