import micro, {RequestHandler} from 'micro'
import cors from './utils/cors'
import capture from './utils/capture'
import prerequest from './utils/prerequest'
import config from './config'
import endpoints from './endpoints'
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
const $ = cors({
  origin: config.urlClient,
})(capture.handle(prerequest(handler)))
if (!process.env.VERCEL) {
  micro($).listen(config.port, () => {
    console.log(`1️⃣  Server: http://localhost:${config.port}`)
    console.log(`2️⃣  Environment: ${config.env}`)
    console.log(`3️⃣  Debug: ${config.debug ? 'on' : 'off'}`)
  })
}
export default $
