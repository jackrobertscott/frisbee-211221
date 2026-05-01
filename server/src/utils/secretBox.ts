import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto'
import {serviceUnavailableError} from '@shared/errors'
import config from '../config'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const VERSION = 'v1'

const getKey = () =>
  createHash('sha256').update(config.gamedaySecretKey).digest()

const toBase64Url = (value: Buffer) => value.toString('base64url')

const fromBase64Url = (value: string) => Buffer.from(value, 'base64url')

export const secretBox = {
  encrypt(value: string) {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, getKey(), iv)
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ])
    const tag = cipher.getAuthTag()
    return [VERSION, toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join(':')
  },

  decrypt(value: string) {
    const [version, ivText, tagText, encryptedText] = value.split(':')
    if (
      version !== VERSION ||
      !ivText?.trim() ||
      !tagText?.trim() ||
      !encryptedText?.trim()
    ) {
      throw serviceUnavailableError('Stored GameDay credentials are invalid.', {
        errorCode: 'gameday.secret_invalid',
        retryable: false,
      })
    }
    const decipher = createDecipheriv(ALGORITHM, getKey(), fromBase64Url(ivText))
    decipher.setAuthTag(fromBase64Url(tagText))
    const decrypted = Buffer.concat([
      decipher.update(fromBase64Url(encryptedText)),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  },
}
