import {SESv2Client, SendEmailCommand} from '@aws-sdk/client-sesv2'
import config from '../config'

const credentials =
  config.SES_ACCESS_KEY_ID && config.SES_SECRET_ACCESS_KEY
    ? {
        accessKeyId: config.SES_ACCESS_KEY_ID,
        secretAccessKey: config.SES_SECRET_ACCESS_KEY,
      }
    : undefined

const client = new SESv2Client({
  region: config.SES_REGION,
  credentials,
})

export const mail = {
  async send({
    to,
    from = `${config.APP_NAME} <${config.SES_FROM_EMAIL}>`,
    subject,
    text,
    html,
    reply,
  }: {
    to: string[]
    from?: string
    subject: string
    text?: string
    html?: string
    reply?: string
  }) {
    const command = new SendEmailCommand({
      FromEmailAddress: from,
      Destination: {ToAddresses: to},
      Content: {
        Simple: {
          Subject: {Data: subject},
          Body: html ? {Html: {Data: html}} : {Text: {Data: text}},
        },
      },
      ReplyToAddresses: reply ? [reply] : undefined,
    })
    return client.send(command)
  },
}
