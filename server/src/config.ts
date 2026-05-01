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
  NODE_ENV: io.optional(io.string().trim()),
  DEBUG: io.optional(io.string().trim()),
  PORT: io.string().trim(),
  APP_NAME: io.string().trim(),
  URL_CLIENT: io.string().trim(),
  MONGODB_URI: io.string().trim(),
  MONGODB_DB: io.string().trim(),
  JWT_SECRET: io.string().trim(),
  SES_ACCESS_KEY_ID: io.string().emptyok().trim(),
  SES_SECRET_ACCESS_KEY: io.string().emptyok().trim(),
  SES_REGION: io.optional(io.string().emptyok().trim()),
  SES_FROM_EMAIL: io.string().emptyok().trim(),
  GAMEDAY_SECRET_KEY: io.optional(io.string().emptyok().trim()),
  GAMEDAY_ALLOWED_HOSTS: io.optional(io.string().emptyok().trim()),
  RESTRICTED_TEAM_ID: io.optional(io.string().emptyok().trim()),
})

const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DEBUG: process.env.DEBUG,
  PORT: process.env.PORT,
  APP_NAME: process.env.APP_NAME,
  URL_CLIENT: process.env.URL_CLIENT,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  JWT_SECRET: process.env.JWT_SECRET,
  SES_ACCESS_KEY_ID: process.env.SES_ACCESS_KEY_ID,
  SES_SECRET_ACCESS_KEY: process.env.SES_SECRET_ACCESS_KEY,
  SES_REGION: process.env.SES_REGION,
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,
  GAMEDAY_SECRET_KEY: process.env.GAMEDAY_SECRET_KEY,
  GAMEDAY_ALLOWED_HOSTS: process.env.GAMEDAY_ALLOWED_HOSTS,
  RESTRICTED_TEAM_ID: process.env.RESTRICTED_TEAM_ID,
}

const envResult = envSchema.validate(rawEnv as any)

if (!envResult.ok) {
  throw new Error(`Invalid server environment: ${envResult.error}`)
}

const portResult = io.number().validate(Number(envResult.value.PORT))

if (!portResult.ok || !Number.isInteger(portResult.value) || portResult.value <= 0) {
  throw new Error('Invalid server environment: [PORT]: Value must be a positive integer.')
}

const env = envResult.value

const config = {
  ...env,
  // Dockerfile injects NODE_ENV=production
  NODE_ENV: env.NODE_ENV || 'development',
  DEBUG: env.DEBUG === 'true' || env.NODE_ENV !== 'production',
  PORT: portResult.value,
  GAMEDAY_SECRET_KEY: env.GAMEDAY_SECRET_KEY || env.JWT_SECRET,
}

export default config
