import crypto from 'node:crypto'
import {
  TGamedayImportConfig,
  TGamedayImportConfigSafe,
} from '@shared/schemas/ioGamedayImport'
import config from '../config'

const CREDENTIAL_VERSION = 'v1'
const IV_LENGTH_BYTES = 12

export const encryptGamedayPassword = (password: string) => {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', credentialKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(password, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    CREDENTIAL_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(tag),
    encodeBase64Url(encrypted),
  ].join(':')
}

export const decryptGamedayPassword = (encryptedPassword: string) => {
  const [version, ivText, tagText, encryptedText] = encryptedPassword.split(':')
  if (
    version !== CREDENTIAL_VERSION ||
    !ivText ||
    !tagText ||
    !encryptedText
  ) {
    throw new Error('Stored GameDay password is not in a supported format.')
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    credentialKey(),
    decodeBase64Url(ivText),
  )
  decipher.setAuthTag(decodeBase64Url(tagText))
  return Buffer.concat([
    decipher.update(decodeBase64Url(encryptedText)),
    decipher.final(),
  ]).toString('utf8')
}

export const toSafeGamedayImportConfig = (
  value: TGamedayImportConfig,
): TGamedayImportConfigSafe => ({
  id: value.id,
  createdOn: value.createdOn,
  updatedOn: value.updatedOn,
  seasonId: value.seasonId,
  username: value.username,
  association: value.association,
  competition: value.competition,
  scheduleEnabled: value.scheduleEnabled,
  scheduleStartOn: value.scheduleStartOn,
  scheduleEndOn: value.scheduleEndOn,
  lastScheduledRunKey: value.lastScheduledRunKey,
  scheduleLockedUntil: value.scheduleLockedUntil,
  hasPassword: value.passwordEncrypted.length > 0,
})

const credentialKey = () => {
  return crypto
    .createHash('sha256')
    .update(config.JWT_SECRET)
    .update('\0gameday-import-credentials')
    .digest()
}

const encodeBase64Url = (value: Buffer) => value.toString('base64url')

const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url')
