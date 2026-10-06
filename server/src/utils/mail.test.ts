import {SendEmailCommand, SESv2Client} from '@aws-sdk/client-sesv2'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {html} from './html'
import {mail} from './mail'

afterEach(() => {
  vi.restoreAllMocks()
})

const captureSends = () => {
  const commands: SendEmailCommand[] = []
  vi.spyOn(SESv2Client.prototype, 'send').mockImplementation(async (command) => {
    if (command instanceof SendEmailCommand) commands.push(command)
    return {$metadata: {}}
  })
  return commands
}

describe('mail.send', () => {
  it('sends an HTML email from the app address', async () => {
    const commands = captureSends()
    await mail.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'ignored when html is set',
    })
    expect(commands).toHaveLength(1)
    expect(commands[0].input).toEqual({
      FromEmailAddress: `${process.env.APP_NAME} <${process.env.SES_FROM_EMAIL}>`,
      Destination: {ToAddresses: ['a@example.com', 'b@example.com']},
      Content: {Simple: {Subject: {Data: 'Hello'}, Body: {Html: {Data: '<p>Hi</p>'}}}},
      ReplyToAddresses: undefined,
    })
  })

  it('sends a plain text email with a custom sender and reply address', async () => {
    const commands = captureSends()
    await mail.send({
      to: ['a@example.com'],
      from: 'Other <other@example.com>',
      subject: 'Plain',
      text: 'Just text',
      reply: 'reply@example.com',
    })
    expect(commands[0].input).toMatchObject({
      FromEmailAddress: 'Other <other@example.com>',
      Content: {Simple: {Body: {Text: {Data: 'Just text'}}}},
      ReplyToAddresses: ['reply@example.com'],
    })
  })

  it('passes delivery failures to the caller', async () => {
    const failure = new Error('MessageRejected')
    vi.spyOn(SESv2Client.prototype, 'send').mockImplementation(async () => {
      throw failure
    })
    await expect(mail.send({to: ['a@example.com'], subject: 'x', text: 'y'})).rejects.toBe(
      failure,
    )
  })
})

describe('html.escape', () => {
  it('escapes every HTML special character, ampersands first', () => {
    expect(html.escape(`<a href="x" title='y'>&amp;</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;',
    )
    expect(html.escape('plain')).toBe('plain')
  })
})
