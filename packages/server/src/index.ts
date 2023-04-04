import http from 'http'
import {RequestHandler, serve as microServe} from 'micro'
import config from './config'
import endpoints from './endpoints'
import capture from './utils/capture'
import cors from './utils/cors'
import prerequest from './utils/prerequest'
/**
 *
 */
const handler: RequestHandler = async (req, res) => {
  if (!req.url) throw new Error('Request url required.')
  if (endpoints.has(req.url))
    // return "null" instead of "undefined" to end request
    return (await endpoints.get(req.url)!(req, res)) ?? null
  throw new Error(`Url ${req.url} is not supported.`)
}
/**
 *
 */
const server = new http.Server(
  microServe(cors()(capture.handle(prerequest(handler))))
)
/**
 *
 */
server.listen(config.port, () => {
  console.log(`Listening: http://localhost:${config.port}`)
})
