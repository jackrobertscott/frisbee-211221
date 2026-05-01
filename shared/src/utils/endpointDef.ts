import {TypeIoValue} from '@shared/torva'

export type TEndpointDef = {
  path: string
  payload?: TypeIoValue<any>
  result?: TypeIoValue<any>
  multipart?: boolean
}
