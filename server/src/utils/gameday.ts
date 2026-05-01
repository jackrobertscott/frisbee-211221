import {
  badRequestError,
  isAppError,
  serviceUnavailableError,
} from '@shared/errors'
import axios from 'axios'
import dns from 'dns'
import net from 'net'
import config from '../config'

const normalizeUrl = (value: string) => value.trim().replace(/\/+$/, '')
const LOOKUP_OPTIONS = {all: true, verbatim: true} as const
const GAMEDAY_REQUEST_TIMEOUT_MS = 10000
// `GAMEDAY_ALLOWED_HOSTS` is a comma-separated list of hostnames such as
// `api.gameday.app,auth.gameday.app,*.gameday.com`. Entries must be bare
// hostnames only: no scheme, path, port, or query string.
const allowedHostPatterns = (config.gamedayAllowedHosts ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

export interface TGamedayConnectionInput {
  organisationId: string
  tokenUrl: string
  apiBaseUrl: string
  clientId: string
  oauthClientSecret: string
  grantType: string
  scope?: string
}

const isPrivateIpv4 = (value: string) => {
  const parts = value.split('.').map((item) => Number(item))
  if (parts.length !== 4 || parts.some((item) => Number.isNaN(item))) return true
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
  if (parts[0] === 0) return true
  if (parts[0] >= 224) return true
  return false
}

const isPrivateIpv6 = (value: string) => {
  const normalized = value.toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  )
}

const assertPublicAddress = (address: string) => {
  const family = net.isIP(address)
  if (!family) {
    throw badRequestError('GameDay URL could not be resolved.', {
      errorCode: 'gameday.url_invalid',
    })
  }
  const invalid =
    family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address)
  if (invalid) {
    throw badRequestError(
      'GameDay URLs must resolve to public HTTPS endpoints.',
      {
        errorCode: 'gameday.url_invalid',
      }
    )
  }
}

const isAllowedHostname = (hostname: string) => {
  if (!allowedHostPatterns.length) return true
  return allowedHostPatterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2)
      return hostname === suffix || hostname.endsWith(`.${suffix}`)
    }
    return hostname === pattern
  })
}

const normalizeConnectionUrl = (rawValue: string, fieldLabel: string) => {
  let url: URL
  try {
    url = new URL(normalizeUrl(rawValue))
  } catch {
    throw badRequestError(`${fieldLabel} must be a valid URL.`, {
      errorCode: 'gameday.url_invalid',
    })
  }
  if (url.protocol !== 'https:') {
    throw badRequestError(`${fieldLabel} must use HTTPS.`, {
      errorCode: 'gameday.url_invalid',
    })
  }
  if (url.username || url.password) {
    throw badRequestError(`${fieldLabel} must not include embedded credentials.`, {
      errorCode: 'gameday.url_invalid',
    })
  }
  const hostname = url.hostname.trim().toLowerCase()
  if (!hostname || !isAllowedHostname(hostname)) {
    throw badRequestError(`${fieldLabel} host is not allowed.`, {
      errorCode: 'gameday.url_invalid',
    })
  }
  if (net.isIP(hostname)) assertPublicAddress(hostname)
  return url.toString().replace(/\/+$/, '')
}

const secureLookup = async (hostname: string, options: object) => {
  const addresses = await dns.promises.lookup(hostname, {
    ...options,
    ...LOOKUP_OPTIONS,
  })
  const match = Array.isArray(addresses) ? addresses[0] : addresses
  if (!match?.address || !match.family) {
    throw badRequestError('GameDay URL could not be resolved.', {
      errorCode: 'gameday.url_invalid',
    })
  }
  assertPublicAddress(match.address)
  return match
}

const requestOptions = {
  timeout: GAMEDAY_REQUEST_TIMEOUT_MS,
  maxRedirects: 0,
  lookup: secureLookup,
  validateStatus: () => true,
}

const normalizeInput = (input: TGamedayConnectionInput) => ({
  organisationId: input.organisationId.trim(),
  tokenUrl: normalizeConnectionUrl(input.tokenUrl, 'Token URL'),
  apiBaseUrl: normalizeConnectionUrl(input.apiBaseUrl, 'API Base URL'),
  clientId: input.clientId.trim(),
  oauthClientSecret: input.oauthClientSecret.trim(),
  grantType: input.grantType.trim(),
  scope: input.scope?.trim() || undefined,
})

export const gameday = {
  async getAccessToken(input: TGamedayConnectionInput) {
    const normalized = normalizeInput(input)
    const payload = new URLSearchParams()
    payload.set('grant_type', normalized.grantType)
    payload.set('client_id', normalized.clientId)
    payload.set('client_secret', normalized.oauthClientSecret)
    if (normalized.scope) payload.set('scope', normalized.scope)

    const {data: tokenData}: any = await axios({
      method: 'POST',
      url: normalized.tokenUrl,
      data: payload.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      ...requestOptions,
    })

    if (
      typeof tokenData?.access_token !== 'string' ||
      !tokenData.access_token.trim()
    ) {
      throw badRequestError(
        'Failed to connect to GameDay with the supplied OAuth settings.',
        {
          errorCode: 'gameday.oauth_invalid',
        }
      )
    }

    return {
      ...normalized,
      accessToken: tokenData.access_token,
    }
  },

  async connect(input: TGamedayConnectionInput) {
    const auth = await this.getAccessToken(input)

    const {status, data}: any = await axios({
      method: 'GET',
      url: `${auth.apiBaseUrl}/organisations`,
      params: {
        organisationId: auth.organisationId,
        page: 1,
        size: 1,
      },
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
      },
      ...requestOptions,
    })

    if (status < 200 || status >= 300) {
      const message =
        typeof data?.errorMessage === 'string'
          ? data.errorMessage
          : typeof data?.message === 'string'
            ? data.message
            : 'Failed to validate the GameDay API configuration.'
      throw badRequestError(message, {
        errorCode: 'gameday.validation_failed',
      })
    }

    if (data?.success === false) {
      throw badRequestError(
        typeof data?.errorMessage === 'string'
          ? data.errorMessage
          : 'Failed to validate the GameDay API configuration.',
        {
          errorCode: 'gameday.validation_failed',
        }
      )
    }

    return {
      accessToken: auth.accessToken,
      connectedOn: new Date().toISOString(),
    }
  },

  digestError(error: unknown) {
    if (isAppError(error)) return error
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return serviceUnavailableError('GameDay request timed out.', {
          errorCode: 'gameday.request_timeout',
          retryable: true,
        })
      }
      if (!error.response) {
        return serviceUnavailableError(
          error.message || 'Failed to reach GameDay.',
          {
            errorCode: 'gameday.request_failed',
            retryable: true,
          }
        )
      }
      const message =
        typeof error.response?.data?.errorMessage === 'string'
          ? error.response.data.errorMessage
          : typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : error.message
      return badRequestError(message || 'Failed to connect to GameDay.', {
        errorCode: 'gameday.request_failed',
      })
    }
    if (error instanceof Error) {
      return serviceUnavailableError(error.message, {
        errorCode: 'gameday.request_failed',
        retryable: true,
      })
    }
    return serviceUnavailableError('Failed to connect to GameDay.', {
      errorCode: 'gameday.request_failed',
      retryable: true,
    })
  },
}
