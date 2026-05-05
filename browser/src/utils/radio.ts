import {
  createError,
  deserializeError,
  serviceUnavailableError,
} from '@shared/errors'
import {config} from '../config'

export const radio = {
  async send(path: string, payload?: any, token?: string) {
    if (!config.urlServer)
      throw serviceUnavailableError('Server url not set in config.', {
        errorCode: 'client.server_url_missing',
      })
    return fetch(`${config.urlServer}${path}`, {
      method: 'POST',
      body: JSON.stringify({
        payload,
        created: Date.now(),
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ?? '',
      },
    }).then(this.handleResponse)
  },

  async multipart(path: string, payload?: FormData, token?: string) {
    return fetch(`${config.urlServer}${path}`, {
      method: 'POST',
      body: payload,
      headers: {
        Authorization: token ?? '',
      },
    }).then(this.handleResponse)
  },

  async handleResponse(i: Response) {
    if (i.status === 204) return undefined
    if (i.status >= 200 && i.status < 300) {
      if (!i.headers.get('Content-Type')?.startsWith('application/json'))
        return i.blob()
      return i.json()
    }
    const contentType = i.headers.get('Content-Type') ?? ''
    if (contentType.startsWith('application/json')) {
      const payload = await i.json()
      throw deserializeError(payload, {
        statusCode: i.status,
        message: 'Server request failed.',
      })
    }
    const message = (await i.text().catch(() => '')).trim()
    if (message) {
      throw createError({
        message,
        statusCode: i.status,
        errorCode: 'request.failed',
      })
    }
    throw createError({
      message: 'Server request failed.',
      statusCode: i.status,
      errorCode: 'request.failed',
      retryable: i.status >= 500,
    })
  },
}
