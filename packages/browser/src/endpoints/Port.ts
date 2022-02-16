import {io} from 'torva'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $PortImport = createEndpoint({
  path: '/PortImport',
  multipart: true,
})
/**
 *
 */
export const $PortExport = createEndpoint({
  path: '/PortExport',
  result: io.object({
    email: io.string(),
  }),
})
