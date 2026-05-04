import {internalError, notFoundError} from '@shared/errors'
import cluster from 'cluster'
import http from 'http'
import {RequestHandler, serve as microServe} from 'micro'
import {
  attachWorkerClusterLifecycle,
  startPrimaryCluster,
} from './clusterAutoscaler'
import config from './config'
import endpoints from './endpoints'
import {backfillUserEnumValues} from './startup/backfillUserEnumValues'
import {backfillUserEmails} from './startup/backfillUserEmails'
import capture from './utils/capture'
import cors from './utils/cors'
import intrusion from './utils/intrusion'
import prerequest from './utils/prerequest'

void bootstrap().catch((error) => {
  console.error('Failed to start server.', error)
  process.exit(1)
})

async function bootstrap() {
  if (!config.IS_PRODUCTION) {
    await backfillUserEnumValues()
    await backfillUserEmails()
    startServer()
    return
  }

  if (cluster.isPrimary) {
    await backfillUserEnumValues()
    await backfillUserEmails()
    startPrimaryCluster()
    return
  }

  startServer()
}


function startServer() {
  const handler: RequestHandler = async (req, res) => {
    if (!req.url)
      throw internalError('Request url required.', {
        errorCode: 'request.url_missing',
      })
    const pathname = intrusion.getPathname(req.url)
    if (endpoints.has(pathname))
      // return "null" instead of "undefined" to end request
      return (await endpoints.get(pathname)!(req, res)) ?? null
    throw notFoundError(`Url ${req.url} is not supported.`, {
      errorCode: 'request.route_not_found',
    })
  }
  const server = new http.Server(
    microServe(cors()(capture.handle(prerequest(handler))))
  )
  attachWorkerClusterLifecycle(server)
  server.listen(config.PORT, () => {
    const cid = cluster.worker ? `WORKER ${cluster.worker.id}` : 'MASTER'
    const envName = config.IS_PRODUCTION ? 'PROD' : 'DEV'
    console.log(`Started: ${envName} ${cid} ${config.PORT}`)
  })
}
