import {TAuthPoint} from '@shared/auth/authAccess'
import {TypeIoAll} from '@shared/torva'

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
