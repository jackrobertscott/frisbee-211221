import * as dotenv from 'dotenv'
import path from 'path'
import {io} from '@shared/torva'
import {fileURLToPath} from 'url'

const envFile =
  process.env.NODE_ENV === 'production' ? '.env.production' : '.env'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.join(__dirname, '..', envFile)
dotenv.config({
  path: envPath,
})

const envSchema = io.object({
  APP_NAME: io.string().trim(),
  URL_CLIENT: io.string().trim(),
  MONGODB_URI: io.string().trim(),
  MONGODB_DB: io.string().trim(),
  JWT_SECRET: io.string().trim(),
  SES_ACCESS_KEY_ID: io.string().emptyok().trim(),
  SES_SECRET_ACCESS_KEY: io.string().emptyok().trim(),
  SES_REGION: io.optional(io.string().emptyok().trim()),
  SES_FROM_EMAIL: io.string().emptyok().trim(),
  IS_PRODUCTION: io.boolean(),
  DEBUG: io.boolean(),
  PORT: io.number().coerce().integer().positive(),
  SESSION_TTL_DAYS: io.number().coerce().integer().positive(),
})

const envResult = envSchema.validate({
  APP_NAME: process.env.APP_NAME,
  URL_CLIENT: process.env.URL_CLIENT,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  JWT_SECRET: process.env.JWT_SECRET,
  SES_ACCESS_KEY_ID: process.env.SES_ACCESS_KEY_ID,
  SES_SECRET_ACCESS_KEY: process.env.SES_SECRET_ACCESS_KEY,
  SES_REGION: process.env.SES_REGION,
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,
  // Dockerfile injects NODE_ENV=production
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  DEBUG: process.env.DEBUG === 'true',
  PORT: process.env.PORT,
  SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS ?? '30',
} as any)

if (!envResult.ok) {
  throw new Error(`Invalid server environment: ${envResult.error}`)
}

export default envResult.value
