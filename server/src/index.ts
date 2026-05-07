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
import capture from './utils/capture'
import cors from './utils/cors'
import intrusion from './utils/intrusion'
import prerequest from './utils/prerequest'
import {runStartupTasks} from './utils/startupTasks'

void bootstrap().catch((error) => {
  console.error('Failed to start server.', error)
  process.exit(1)
})

async function bootstrap() {
  if (shouldRunStartupTasks()) {
    await runStartupTasks()
  }

  if (shouldStartPrimaryCluster()) {
    startPrimaryCluster()
    return
  }

  startServer()
}

function shouldRunStartupTasks() {
  return !config.IS_PRODUCTION || cluster.isPrimary
}

function shouldStartPrimaryCluster() {
  return config.IS_PRODUCTION && cluster.isPrimary
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
    microServe(cors()(capture.handle(prerequest(handler)))),
  )
  attachWorkerClusterLifecycle(server)
  server.listen(config.PORT, () => {
    const cid = cluster.worker ? `WORKER ${cluster.worker.id}` : 'MASTER'
    const envName = config.IS_PRODUCTION ? 'PROD' : 'DEV'
    console.log(`Started: ${envName} ${cid} ${config.PORT}`)
  })
}
