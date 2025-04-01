import axios from 'axios'
import config from '../config'
/**
 *
 */
export const getGoogleAccessToken = async (
  code: string
): Promise<{access_token: string}> => {
  const {data}: any = await axios({
    url: `https://oauth2.googleapis.com/token`,
    method: 'POST',
    data: {
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: `${config.urlClient}/google`,
      grant_type: 'authorization_code',
      code,
    },
  })
  // const { access_token, expires_in, token_type, refresh_token } = data
  if (typeof data.access_token !== 'string')
    throw new Error('Failed to get Google access token.')
  return data
}
/**
 *
 */
export const getGoogleUserInfo = async (
  access_token: string
): Promise<{
  id: string
  email: string
  given_name?: string
  family_name?: string
}> => {
  const {data}: any = await axios({
    url: 'https://www.googleapis.com/oauth2/v2/userinfo',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  })
  // const { id, email, given_name, family_name } = data
  if (typeof data.email !== 'string')
    throw new Error('Failed to get user email from Google.')
  return data
}
