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
  STRIPE_SECRET_KEY: io.string().emptyok().trim(),
  JWT_SECRET: io.string().trim(),
  AWS_ACCESS_KEY_ID: io.string().emptyok().trim(),
  AWS_SECRET_ACCESS_KEY: io.string().emptyok().trim(),
  AWS_BUCKET: io.string().emptyok().trim(),
  AWS_BUCKET_REGION: io.string().trim(),
  AWS_FROM_EMAIL: io.string().emptyok().trim(),
  GAMEDAY_SECRET_KEY: io.optional(io.string().emptyok().trim()),
  GAMEDAY_ALLOWED_HOSTS: io.optional(io.string().emptyok().trim()),
})

const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DEBUG: process.env.DEBUG,
  PORT: process.env.PORT,
  APP_NAME: process.env.APP_NAME,
  URL_CLIENT: process.env.URL_CLIENT,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_BUCKET: process.env.AWS_BUCKET,
  AWS_BUCKET_REGION: process.env.AWS_BUCKET_REGION,
  AWS_FROM_EMAIL: process.env.AWS_FROM_EMAIL,
  GAMEDAY_SECRET_KEY: process.env.GAMEDAY_SECRET_KEY,
  GAMEDAY_ALLOWED_HOSTS: process.env.GAMEDAY_ALLOWED_HOSTS,
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

const config: {
  env: string
  prod: boolean
  debug: boolean
  port: number
  appName: string
  urlClient: string
  mongodbUri: string
  mongodbName: string
  stripeSecretKey: string
  jwtSecret: string
  AWSAccessKeyId: string
  AWSAccessKeySecret: string
  AWSBucket: string
  AWSBucketRegion: string
  AWSFromEmail: string
  gamedaySecretKey: string
  gamedayAllowedHosts?: string
} = {
  env: env.NODE_ENV || 'development',
  prod: !env.URL_CLIENT?.startsWith('http://localhost'),
  debug: env.DEBUG === 'true' || env.NODE_ENV !== 'production',
  port: portResult.value,
  appName: env.APP_NAME,
  urlClient: env.URL_CLIENT,
  mongodbUri: env.MONGODB_URI,
  mongodbName: env.MONGODB_DB,
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  jwtSecret: env.JWT_SECRET,
  AWSAccessKeyId: env.AWS_ACCESS_KEY_ID,
  AWSAccessKeySecret: env.AWS_SECRET_ACCESS_KEY,
  AWSBucket: env.AWS_BUCKET,
  AWSBucketRegion: env.AWS_BUCKET_REGION,
  AWSFromEmail: env.AWS_FROM_EMAIL,
  gamedaySecretKey: env.GAMEDAY_SECRET_KEY || env.JWT_SECRET,
  gamedayAllowedHosts: env.GAMEDAY_ALLOWED_HOSTS,
}

export default config
