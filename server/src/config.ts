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
  SESSION_TTL_DAYS: io.optional(io.string().trim()),
  APP_NAME: io.string().trim(),
  URL_CLIENT: io.string().trim(),
  MONGODB_URI: io.string().trim(),
  MONGODB_DB: io.string().trim(),
  JWT_SECRET: io.string().trim(),
  SES_ACCESS_KEY_ID: io.string().emptyok().trim(),
  SES_SECRET_ACCESS_KEY: io.string().emptyok().trim(),
  SES_REGION: io.optional(io.string().emptyok().trim()),
  SES_FROM_EMAIL: io.string().emptyok().trim(),
})

const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DEBUG: process.env.DEBUG,
  PORT: process.env.PORT,
  SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS,
  APP_NAME: process.env.APP_NAME,
  URL_CLIENT: process.env.URL_CLIENT,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  JWT_SECRET: process.env.JWT_SECRET,
  SES_ACCESS_KEY_ID: process.env.SES_ACCESS_KEY_ID,
  SES_SECRET_ACCESS_KEY: process.env.SES_SECRET_ACCESS_KEY,
  SES_REGION: process.env.SES_REGION,
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,
}

const envResult = envSchema.validate(rawEnv as any)

if (!envResult.ok) {
  throw new Error(`Invalid server environment: ${envResult.error}`)
}

const portResult = io.number().validate(Number(envResult.value.PORT))
const sessionTtlDaysResult = io
  .number()
  .validate(Number(envResult.value.SESSION_TTL_DAYS ?? 30))

if (
  !portResult.ok ||
  !Number.isInteger(portResult.value) ||
  portResult.value <= 0
) {
  throw new Error(
    'Invalid server environment: [PORT]: Value must be a positive integer.',
  )
}
if (
  !sessionTtlDaysResult.ok ||
  !Number.isInteger(sessionTtlDaysResult.value) ||
  sessionTtlDaysResult.value <= 0
) {
  throw new Error(
    'Invalid server environment: [SESSION_TTL_DAYS]: Value must be a positive integer.',
  )
}

const env = envResult.value
const {
  NODE_ENV: _nodeEnv,
  DEBUG: _debug,
  PORT: _port,
  SESSION_TTL_DAYS: _sessionTtlDays,
  ...configEnv
} = env

const config = {
  ...configEnv,
  // Dockerfile injects NODE_ENV=production
  IS_PRODUCTION: env.NODE_ENV === 'production',
  DEBUG: env.DEBUG === 'true',
  PORT: portResult.value,
  SESSION_TTL_DAYS: sessionTtlDaysResult.value,
}

export default config
