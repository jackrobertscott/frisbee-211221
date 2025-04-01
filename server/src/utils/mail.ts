import {SESv2Client, SendEmailCommand} from '@aws-sdk/client-sesv2'
import config from '../config'
/**
 *
 */
const client = new SESv2Client({
  region: 'us-east-1',
})
/**
 *
 */
export const mail = {
  /**
   *
   */
  async send({
    to,
    from = `${config.appName} <${config.AWSFromEmail}>`,
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
