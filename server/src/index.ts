import cluster from 'cluster'
import http from 'http'
import {serve as microServe} from 'micro'
import {
  attachWorkerClusterLifecycle,
  startPrimaryCluster,
} from './clusterAutoscaler'
import config from './config'
import {startGamedayImportScheduler} from './gameday/scheduler'
import {createRequestHandler} from './http/requestHandler'
import {runStartupTasks} from './utils/startupTasks'

void bootstrap().catch((error) => {
  console.error('Failed to start server.', error)
  process.exit(1)
})

async function bootstrap() {
  if (shouldRunStartupTasks()) {
    await runStartupTasks()
  }

  if (shouldRunGamedayImportScheduler()) {
    startGamedayImportScheduler()
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

function shouldRunGamedayImportScheduler() {
  return !config.IS_PRODUCTION || cluster.isPrimary
}

function shouldStartPrimaryCluster() {
  return config.IS_PRODUCTION && cluster.isPrimary
}

function startServer() {
  const server = new http.Server(microServe(createRequestHandler()))
  attachWorkerClusterLifecycle(server)
  server.listen(config.PORT, () => {
    const cid = cluster.worker ? `WORKER ${cluster.worker.id}` : 'MASTER'
    const envName = config.IS_PRODUCTION ? 'PROD' : 'DEV'
    console.log(`Started: ${envName} ${cid} ${config.PORT}`)
  })
}
