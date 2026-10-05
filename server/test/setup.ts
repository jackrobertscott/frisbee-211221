import {randomBytes} from 'crypto'
import {inject} from 'vitest'

// config.ts validates the environment on import, so it must be set before any server module loads
process.env.APP_NAME = 'Frisbee Test'
process.env.URL_CLIENT = 'http://localhost:3000'
process.env.MONGODB_URI = inject('mongoUri')
process.env.MONGODB_DB = `test-${randomBytes(6).toString('hex')}`
process.env.JWT_SECRET = 'test-secret'
process.env.SES_ACCESS_KEY_ID = ''
process.env.SES_SECRET_ACCESS_KEY = ''
process.env.SES_FROM_EMAIL = ''
process.env.PORT = '4999'
process.env.GAMEDAY_IMPORT_SCHEDULER_DISABLED = 'true'
