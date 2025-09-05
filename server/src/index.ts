import cluster from 'cluster'
import http from 'http'
import {RequestHandler, serve as microServe} from 'micro'
import os from 'os'
import config from './config'
import endpoints from './endpoints'
import capture from './utils/capture'
import cors from './utils/cors'
import prerequest from './utils/prerequest'

const MAX_CLUSTER_WORKERS = Math.min(os.cpus().length, 2)

if (!config.prod) {
  startServer()
} else {
  if (cluster.isPrimary) {
    for (let i = 0; i < MAX_CLUSTER_WORKERS; i++) {
      cluster.fork()
    }
  } else {
    startServer()
  }
}

function startServer() {
  const handler: RequestHandler = async (req, res) => {
    if (!req.url) throw new Error('Request url required.')
    if (endpoints.has(req.url))
      // return "null" instead of "undefined" to end request
      return (await endpoints.get(req.url)!(req, res)) ?? null
    throw new Error(`Url ${req.url} is not supported.`)
  }
  const server = new http.Server(
    microServe(cors()(capture.handle(prerequest(handler))))
  )
  server.listen(config.port, () => {
    const cid = cluster.worker ? `WORKER ${cluster.worker.id}` : 'MASTER'
    const envName = config.prod ? 'PROD' : 'DEV'
    console.log(`Started: ${envName} ${cid} ${config.port}`)
  })
}
