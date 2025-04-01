import {config} from '../config'
/**
 *
 */
export const radio = {
  /**
   *
   */
  async send(path: string, payload?: any, token?: string) {
    if (!config.urlServer) throw new Error('Server url not set in config.')
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
  /**
   *
   */
  async multipart(path: string, payload?: FormData, token?: string) {
    return fetch(`${config.urlServer}${path}`, {
      method: 'POST',
      body: payload,
      headers: {
        Authorization: token ?? '',
      },
    }).then(this.handleResponse)
  },
  /**
   *
   */
  async handleResponse(i: Response) {
    if (i.status === 204) return undefined
    if (i.status >= 200 && i.status < 300) {
      if (!i.headers.get('Content-Type')?.startsWith('application/json'))
        return i.blob()
      return i.json()
    }
    const payload = await i.json()
    if (payload.message) throw new Error(payload.message)
    throw new Error('Server request failed.')
  },
}
