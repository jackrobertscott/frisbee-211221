import path from 'path'
import * as dotenvSafe from 'dotenv-safe'
import * as dotenv from 'dotenv'
/**
 *
 */
const envFile =
  process.env.NODE_ENV === 'production' ? '.env.production' : '.env'
const envPath = path.join(__dirname, '..', envFile)
dotenvSafe.config({
  allowEmptyValues: true,
  path: envPath,
})
dotenv.config({
  path: envPath,
})
/**
 *
 */
const env = process.env as Record<string, string>
/**
 *
 */
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
  sentryDSN?: string
  AWSAccessKeyId: string
  AWSAccessKeySecret: string
  AWSRegion: string
  AWSBucket: string
  AWSFromEmail: string
  googleClientId?: string
  googleClientSecret?: string
} = {
  env: env.NODE_ENV || 'development',
  prod: env.NODE_ENV === 'production',
  debug: true,
  port: +env.PORT,
  appName: 'Marlow Street',
  urlClient: env.URL_CLIENT,
  mongodbUri: env.MONGODB_URI,
  mongodbName: env.MONGODB_DB,
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  jwtSecret: env.JWT_SECRET,
  sentryDSN: env.SENTRY_DSN,
  AWSAccessKeyId: env.AMAZON_ACCESS_KEY_ID,
  AWSAccessKeySecret: env.AMAZON_ACCESS_KEY_SECRET,
  AWSRegion: env.AMAZON_REGION,
  AWSBucket: env.AMAZON_BUCKET,
  AWSFromEmail: env.AMAZON_FROM_EMAIL,
  googleClientId: env.GOOGLE_CLIENT_ID,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET,
}
/**
 *
 */
export default config
