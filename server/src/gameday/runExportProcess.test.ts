import {EventEmitter} from 'node:events'
import path from 'node:path'
import {PassThrough} from 'node:stream'
import type {SpawnOptions} from 'node:child_process'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {runGamedayExportProcess} from './runExportProcess'
import type {TGamedayExportInput, TGamedayExportOutput} from './types'

class FakeChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn<(signal?: NodeJS.Signals) => boolean>(() => true)
  stdinText = ''

  constructor() {
    super()
    this.stdin.on('data', (chunk: Buffer) => {
      this.stdinText += chunk.toString('utf8')
    })
  }
}

const {spawnMock} = vi.hoisted(() => ({
  spawnMock: vi.fn<
    (command: string, args: string[], options: SpawnOptions) => FakeChild
  >(),
}))

vi.mock('node:child_process', () => ({spawn: spawnMock}))

const input: TGamedayExportInput = {
  startingUrl: 'https://example.com/',
  username: 'user',
  password: 'secret',
  association: 'Assoc',
  competition: 'Comp',
}

const output: TGamedayExportOutput = {
  members: [
    {
      teamName: 'Team',
      firstName: 'First',
      lastName: 'Last',
      email: 'first@example.com',
      gender: 'Female',
    },
  ],
}

let child: FakeChild

beforeEach(() => {
  child = new FakeChild()
  spawnMock.mockImplementation(() => child)
})

afterEach(() => {
  spawnMock.mockReset()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

/** Lets the stream and promise callbacks queued by the fake child run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('runGamedayExportProcess', () => {
  it('runs the CLI with tsx, sends the input and parses the output', async () => {
    const result = runGamedayExportProcess(input)
    child.stdout.write(JSON.stringify(output).slice(0, 10))
    child.stdout.write(JSON.stringify(output).slice(10))
    child.stderr.write('Opening GameDay...\n')
    await flush()
    child.emit('close', 0)

    await expect(result).resolves.toEqual(output)
    expect(JSON.parse(child.stdinText)).toEqual(input)

    const [command, args, options] = spawnMock.mock.calls[0]
    const serverRoot = path.resolve(__dirname, '..', '..')
    expect(command).toBe(process.execPath)
    expect(args).toEqual([
      '--import',
      'tsx',
      path.join(serverRoot, 'src', 'gameday', 'exportCli.ts'),
    ])
    expect(options.cwd).toBe(serverRoot)
  })

  it('does not pass server secrets to the child process', async () => {
    vi.stubEnv('JWT_SECRET', 'jwt')
    vi.stubEnv('MONGODB_URI', 'mongodb://secret')
    vi.stubEnv('SES_ACCESS_KEY_ID', 'key')
    vi.stubEnv('SES_SECRET_ACCESS_KEY', 'secret')
    vi.stubEnv('GAMEDAY_HEADLESS', 'false')
    const result = runGamedayExportProcess(input)
    child.stdout.write(JSON.stringify(output))
    await flush()
    child.emit('close', 0)
    await result

    const env = spawnMock.mock.calls[0][2].env ?? {}
    expect(env.GAMEDAY_HEADLESS).toBe('false')
    expect(env.APP_NAME).toBe(process.env.APP_NAME)
    for (const key of [
      'JWT_SECRET',
      'MONGODB_URI',
      'SES_ACCESS_KEY_ID',
      'SES_SECRET_ACCESS_KEY',
    ]) {
      expect(env).not.toHaveProperty(key)
    }
  })

  it('reports the last lines of stderr when the process fails', async () => {
    const result = runGamedayExportProcess(input)
    const lines = Array.from({length: 15}, (_, index) => `line ${index + 1}`)
    child.stderr.write(`${lines.join('\r\n')}\n\n   \n`)
    await flush()
    child.emit('close', 1)

    const tail = lines.slice(-12).join('\n')
    await expect(result).rejects.toMatchObject({
      message: `GameDay export failed. ${tail}`,
      errorCode: 'gameday.export_failed',
      statusCode: 400,
      details: tail,
    })
  })

  it('uses a plain message when a failed process wrote nothing', async () => {
    const result = runGamedayExportProcess(input)
    child.emit('close', null)
    await expect(result).rejects.toMatchObject({
      message: 'GameDay export failed.',
      errorCode: 'gameday.export_failed',
    })
  })

  it.each([
    ['invalid JSON', 'not json'],
    ['an unexpected shape', JSON.stringify({members: [{teamName: 'x'}]})],
  ])('rejects %s on stdout', async (_label, stdout) => {
    const result = runGamedayExportProcess(input)
    child.stdout.write(stdout)
    await flush()
    child.emit('close', 0)
    await expect(result).rejects.toMatchObject({
      errorCode: 'gameday.response_invalid',
      statusCode: 500,
      details: stdout,
    })
  })

  it('reports a process that cannot start and ignores the later close', async () => {
    const result = runGamedayExportProcess(input)
    const cause = new Error('spawn ENOENT')
    child.emit('error', cause)
    child.emit('close', 0)
    await expect(result).rejects.toMatchObject({
      errorCode: 'gameday.process_start_failed',
      cause,
    })
  })

  it('kills the process when it runs past the timeout', async () => {
    vi.useFakeTimers()
    vi.stubEnv('GAMEDAY_PROCESS_TIMEOUT_MS', '5000')
    const result = runGamedayExportProcess(input)
    const assertion = expect(result).rejects.toMatchObject({
      errorCode: 'gameday.export_timeout',
      statusCode: 503,
    })
    await vi.advanceTimersByTimeAsync(4999)
    expect(child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    // the close that follows the kill does not settle the promise again
    child.emit('close', null)
    await assertion
  })

  it.each(['', 'nope', '-1'])(
    'falls back to the default timeout for %j',
    async (value) => {
      vi.useFakeTimers()
      vi.stubEnv('GAMEDAY_PROCESS_TIMEOUT_MS', value)
      vi.stubEnv('GAMEDAY_TIMEOUT_MS', undefined)
      const result = runGamedayExportProcess(input)
      const assertion = expect(result).rejects.toMatchObject({
        errorCode: 'gameday.export_timeout',
      })
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 - 1)
      expect(child.kill).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
      await assertion
    },
  )

  it('uses the scraper timeout when no process timeout is set', async () => {
    vi.useFakeTimers()
    vi.stubEnv('GAMEDAY_PROCESS_TIMEOUT_MS', undefined)
    vi.stubEnv('GAMEDAY_TIMEOUT_MS', '2000')
    const result = runGamedayExportProcess(input)
    const assertion = expect(result).rejects.toMatchObject({
      errorCode: 'gameday.export_timeout',
    })
    await vi.advanceTimersByTimeAsync(2000)
    await assertion
  })

  it('kills the process when stdout grows too large', async () => {
    const result = runGamedayExportProcess(input)
    const assertion = expect(result).rejects.toMatchObject({
      errorCode: 'gameday.output_too_large',
    })
    child.stdout.write('x'.repeat(50 * 1024 * 1024 + 1))
    await flush()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('close', 0)
    await assertion
  })
})
