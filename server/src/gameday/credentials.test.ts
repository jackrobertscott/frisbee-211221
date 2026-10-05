import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {describe, expect, it} from 'vitest'
import {
  decryptGamedayPassword,
  encryptGamedayPassword,
  toSafeGamedayImportConfig,
} from './credentials'

describe('GameDay password encryption', () => {
  it('round-trips passwords', () => {
    for (const password of ['secret', 'p@ss:word with spaces', 'üñíçødé 🔑']) {
      expect(decryptGamedayPassword(encryptGamedayPassword(password))).toBe(
        password,
      )
    }
  })

  it('uses a versioned, base64url, colon-separated format', () => {
    const encrypted = encryptGamedayPassword('secret')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
    for (const part of parts.slice(1)) {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
    }
    expect(Buffer.from(parts[1], 'base64url')).toHaveLength(12)
    expect(Buffer.from(parts[2], 'base64url')).toHaveLength(16)
  })

  it('uses a random IV per encryption', () => {
    expect(encryptGamedayPassword('secret')).not.toBe(
      encryptGamedayPassword('secret'),
    )
  })

  it('detects tampering with the ciphertext or tag', () => {
    const [version, iv, tag, data] = encryptGamedayPassword('secret').split(':')
    const flip = (value: string) => {
      const bytes = Buffer.from(value, 'base64url')
      bytes[0] ^= 1
      return bytes.toString('base64url')
    }
    expect(() =>
      decryptGamedayPassword([version, iv, tag, flip(data)].join(':')),
    ).toThrow()
    expect(() =>
      decryptGamedayPassword([version, iv, flip(tag), data].join(':')),
    ).toThrow()
    expect(() =>
      decryptGamedayPassword([version, flip(iv), tag, data].join(':')),
    ).toThrow()
  })

  it('rejects unsupported formats', () => {
    const message = 'Stored GameDay password is not in a supported format.'
    const [, iv, tag, data] = encryptGamedayPassword('secret').split(':')
    expect(() => decryptGamedayPassword('')).toThrow(message)
    expect(() => decryptGamedayPassword('plain-text')).toThrow(message)
    expect(() =>
      decryptGamedayPassword(['v2', iv, tag, data].join(':')),
    ).toThrow(message)
    expect(() => decryptGamedayPassword(['v1', iv, tag].join(':'))).toThrow(
      message,
    )
  })

  it('cannot decrypt an encrypted empty password', () => {
    // the empty ciphertext segment fails the format check
    const encrypted = encryptGamedayPassword('')
    expect(encrypted.endsWith(':')).toBe(true)
    expect(() => decryptGamedayPassword(encrypted)).toThrow(
      'Stored GameDay password is not in a supported format.',
    )
  })
})

describe('toSafeGamedayImportConfig', () => {
  const config: TGamedayImportConfig = {
    id: 'c1',
    createdOn: '2024-01-01T00:00:00.000Z',
    updatedOn: '2024-01-02T00:00:00.000Z',
    seasonId: 's1',
    username: 'user',
    passwordEncrypted: 'v1:a:b:c',
    association: 'assoc',
    competition: 'comp',
    scheduleEnabled: true,
    scheduleStartOn: '2024-02-01T00:00:00.000Z',
    scheduleEndOn: '2024-03-01T00:00:00.000Z',
    lastScheduledRunKey: 'key',
    scheduleLockedUntil: '2024-02-01T02:00:00.000Z',
    scheduleLockToken: 'token',
  }

  it('omits secrets and reports whether a password is stored', () => {
    expect(toSafeGamedayImportConfig(config)).toEqual({
      id: 'c1',
      createdOn: '2024-01-01T00:00:00.000Z',
      updatedOn: '2024-01-02T00:00:00.000Z',
      seasonId: 's1',
      username: 'user',
      association: 'assoc',
      competition: 'comp',
      scheduleEnabled: true,
      scheduleStartOn: '2024-02-01T00:00:00.000Z',
      scheduleEndOn: '2024-03-01T00:00:00.000Z',
      lastScheduledRunKey: 'key',
      scheduleLockedUntil: '2024-02-01T02:00:00.000Z',
      hasPassword: true,
    })
  })

  it('reports no password for an empty encrypted password', () => {
    const safe = toSafeGamedayImportConfig({...config, passwordEncrypted: ''})
    expect(safe.hasPassword).toBe(false)
    expect(safe).not.toHaveProperty('passwordEncrypted')
    expect(safe).not.toHaveProperty('scheduleLockToken')
  })
})
