import {TAuthPoint} from '@shared/auth/authAccess'
import {TypeIoValue} from '@shared/torva'

export type TEndpointDef = {
  path: string
  access?: TAuthPoint
  payload?: TypeIoValue<any>
  result?: TypeIoValue<any>
  multipart?: boolean
}
