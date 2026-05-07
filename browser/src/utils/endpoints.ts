import {TAuthPoint} from '@shared/auth/authAccess'
import {TypeIoAll, TypeIoValue} from '@shared/torva'
import {radio} from './radio'

export type TEndpointInput<
  I extends TypeIoAll | undefined,
  M extends boolean,
> = M extends true ? FormData : I extends TypeIoAll ? TypeIoValue<I> : undefined

export type TEndpointOutput<O extends TypeIoAll | undefined> =
  O extends TypeIoAll ? TypeIoValue<O> : undefined

export interface TEndpoint<
  I extends TypeIoAll | undefined,
  O extends TypeIoAll | undefined,
  M extends boolean,
> {
  readonly IN: I
  readonly OUT: O
  readonly MULTIPART: M
  readonly access?: TAuthPoint
  fetch(
    payload?: TEndpointInput<I, M>,
    token?: string,
  ): Promise<TEndpointOutput<O>>
}

export function createEndpoint<
  I extends TypeIoAll | undefined = undefined,
  O extends TypeIoAll | undefined = undefined,
>(options: {
  path: string
  access?: TAuthPoint
  multipart?: false | undefined
  payload?: I
  result?: O
}): TEndpoint<I, O, false>

export function createEndpoint<O extends TypeIoAll | undefined = undefined>(
  options: {
    path: string
    access?: TAuthPoint
    multipart: true
    payload?: undefined
    result?: O
  },
): TEndpoint<undefined, O, true>

export function createEndpoint<
  I extends TypeIoAll | undefined = undefined,
  O extends TypeIoAll | undefined = undefined,
>(options: {
  path: string
  access?: TAuthPoint
  multipart?: boolean
  payload?: I
  result?: O
}): TEndpoint<I, O, boolean> {
  return {
    access: options.access,
    async fetch(payload, token) {
      if (options.multipart)
        return radio.multipart(options.path, payload as FormData, token)
      return radio.send(options.path, payload, token)
    },
  } as TEndpoint<I, O, boolean>
}
