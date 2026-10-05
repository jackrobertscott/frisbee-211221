import {TAuthPoint} from '@shared/auth/authAccess'
import {io, TypeIoAll} from '@shared/torva'

export const LIST_LIMIT_MAX = 100

/** Page size for list endpoints, bounded so one request cannot load a collection. */
export const ioListLimit = () =>
  io.optional(io.number().integer().min(1).max(LIST_LIMIT_MAX))

export const ioListSkip = () => io.optional(io.number().integer().min(0))

export const SORT_DIRECTIONS = ['asc', 'desc'] as const

export type TSortDirection = (typeof SORT_DIRECTIONS)[number]

export const ioSortDirection = () => io.optional(io.enum([...SORT_DIRECTIONS]))

export type ExactShape<Expected, Actual extends Expected> = Actual &
  Record<Exclude<keyof Actual, keyof Expected>, never>

export const exactShape =
  <Expected>() =>
  <Actual extends Expected>(value: ExactShape<Expected, Actual>): Expected =>
    value

export type TEndpointDef = {
  path: string
  access?: TAuthPoint
  payload?: TypeIoAll
  result?: TypeIoAll
  multipart?: boolean
}
