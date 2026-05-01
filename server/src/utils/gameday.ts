import {badRequestError, isAppError, serviceUnavailableError} from '@shared/errors'
import axios from 'axios'

const normalizeUrl = (value: string) => value.trim().replace(/\/+$/, '')

export interface TGamedayConnectionInput {
  organisationId: string
  tokenUrl: string
  apiBaseUrl: string
  clientId: string
  clientSecret: string
  grantType: string
  scope?: string
}

export const gameday = {
  async connect(input: TGamedayConnectionInput) {
    const tokenUrl = normalizeUrl(input.tokenUrl)
    const apiBaseUrl = normalizeUrl(input.apiBaseUrl)
    const payload = new URLSearchParams()
    payload.set('grant_type', input.grantType.trim())
    payload.set('client_id', input.clientId.trim())
    payload.set('client_secret', input.clientSecret.trim())
    if (input.scope?.trim()) payload.set('scope', input.scope.trim())

    const {data: tokenData}: any = await axios({
      method: 'POST',
      url: tokenUrl,
      data: payload.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      validateStatus: () => true,
    })

    if (typeof tokenData?.access_token !== 'string' || !tokenData.access_token.trim()) {
      throw badRequestError('Failed to connect to GameDay with the supplied OAuth settings.', {
        errorCode: 'gameday.oauth_invalid',
      })
    }

    const {status, data}: any = await axios({
      method: 'GET',
      url: `${apiBaseUrl}/organisations`,
      params: {
        organisationId: input.organisationId.trim(),
        page: 1,
        size: 1,
      },
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      validateStatus: () => true,
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
      accessToken: tokenData.access_token,
      connectedOn: new Date().toISOString(),
    }
  },

  digestError(error: unknown) {
    if (isAppError(error)) return error
    if (axios.isAxiosError(error)) {
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
