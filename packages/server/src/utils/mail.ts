import {SES} from 'aws-sdk'
import config from '../config'
import aws from './aws'
/**
 *
 */
export default {
  /**
   *
   */
  async send({
    to,
    from = config.AWSFromEmail,
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
    const email: SES.Types.SendEmailRequest = {
      Source: from,
      Destination: {
        ToAddresses: to,
      },
      Message: {
        Subject: {
          Charset: 'UTF-8',
          Data: `${subject.trim()} | ${config.appName}`,
        },
        Body: {},
      },
    }
    if (text) {
      email.Message.Body.Text = {
        Charset: 'UTF-8',
        Data: text,
      }
    }
    if (html) {
      email.Message.Body.Html = {
        Charset: 'UTF-8',
        Data: html,
      }
    }
    if (reply) {
      email.ReplyToAddresses = [reply]
    }
    return aws.ses.sendEmail(email).promise()
  },
}
