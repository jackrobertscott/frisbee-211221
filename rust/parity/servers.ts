/**
 * Starts the servers the parity harness and the UI run talk to: a throwaway
 * `mongod` + the TS server (via tsx), and the Rust release binary on a fresh
 * SQLite file. Both get the same environment and log security codes instead of
 * emailing them (no SES credentials), which is how the harness reads codes.
 */
import {ChildProcess, execFile, spawn} from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {MongoClient} from 'mongodb'

const execFileAsync = promisify(execFile)

export const PARITY_DIR = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(PARITY_DIR, '../..')
export const CLIENT_ORIGIN = 'http://localhost:3000'

export const SHARED_ENV = {
  APP_NAME: 'Frisbee Parity',
  URL_CLIENT: CLIENT_ORIGIN,
  JWT_SECRET: 'parity-jwt-secret-0123456789',
  SES_ACCESS_KEY_ID: '',
  SES_SECRET_ACCESS_KEY: '',
  SES_REGION: 'us-east-1',
  SES_FROM_EMAIL: '',
  SESSION_TTL_DAYS: '90',
  GAMEDAY_IMPORT_SCHEDULER_DISABLED: '1',
  // a zone with daylight saving, so local-time date maths is exercised
  TZ: process.env.PARITY_TZ ?? 'Australia/Sydney',
}

export type TSecurityCode = {subject: string; email: string; code: string}

const CODE_LINE = /\[security-code\] (.+) (\S+@\S+) (\S+) \(/

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

/** A child process whose output is kept (and scanned for security codes). */
export class Proc {
  readonly lines: string[] = []
  readonly codes: TSecurityCode[] = []
  private exited = false
  private waiters: Array<() => void> = []

  constructor(
    readonly name: string,
    readonly child: ChildProcess,
    logFile?: string,
  ) {
    const log = logFile ? fs.createWriteStream(logFile) : undefined
    const onData = (chunk: Buffer) => {
      log?.write(chunk)
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue
        this.lines.push(line)
        const match = line.match(CODE_LINE)
        if (match)
          this.codes.push({subject: match[1], email: match[2], code: match[3]})
      }
      this.waiters.forEach((w) => w())
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('exit', (code, signal) => {
      this.exited = true
      this.lines.push(`[${name} exited code=${code} signal=${signal}]`)
      this.waiters.forEach((w) => w())
      log?.end()
    })
  }

  async waitFor(pattern: RegExp, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!this.lines.some((line) => pattern.test(line))) {
      if (this.exited)
        throw new Error(
          `${this.name} exited before ${pattern}:\n${this.lines.slice(-30).join('\n')}`,
        )
      if (Date.now() > deadline)
        throw new Error(
          `${this.name} did not log ${pattern} in time:\n${this.lines.slice(-30).join('\n')}`,
        )
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 200)
        this.waiters.push(() => {
          clearTimeout(timer)
          resolve()
        })
      })
      this.waiters = []
    }
  }

  latestCode(email: string): string {
    const found = this.codes.filter((c) => c.email === email).at(-1)
    if (!found) throw new Error(`${this.name}: no security code sent to ${email}`)
    return found.code
  }

  async stop(): Promise<void> {
    if (this.exited) return
    this.child.kill('SIGTERM')
    const deadline = Date.now() + 10_000
    while (!this.exited && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100))
    if (!this.exited) this.child.kill('SIGKILL')
  }
}

export interface IServer {
  readonly kind: 'ts' | 'rust'
  readonly url: string
  readonly proc: Proc
  /** Makes a user an admin with a direct database write. */
  promoteAdmin(userId: string): Promise<void>
  stop(): Promise<void>
}

export type TStartOptions = {
  workDir: string
  /** The browser origin the server accepts (default CLIENT_ORIGIN). */
  urlClient?: string
}

export function makeWorkDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const MONGOD = process.env.MONGOD_PATH ?? '/opt/homebrew/bin/mongod'

export async function startTsServer(options: TStartOptions): Promise<IServer> {
  const mongoDir = path.join(options.workDir, 'mongo')
  fs.mkdirSync(mongoDir, {recursive: true})
  const mongoPort = await freePort()
  const mongod = new Proc(
    'mongod',
    spawn(
      MONGOD,
      ['--dbpath', mongoDir, '--port', String(mongoPort), '--bind_ip', '127.0.0.1'],
      {stdio: ['ignore', 'pipe', 'pipe']},
    ),
    path.join(options.workDir, 'mongod.log'),
  )
  await mongod.waitFor(/Waiting for connections/)
  const mongoUri = `mongodb://127.0.0.1:${mongoPort}`
  const dbName = 'frisbee_parity'
  const port = await freePort()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...SHARED_ENV,
    ...(options.urlClient ? {URL_CLIENT: options.urlClient} : {}),
    MONGODB_URI: mongoUri,
    MONGODB_DB: dbName,
    PORT: String(port),
  }
  delete env.NODE_ENV
  const tsx = path.join(ROOT, 'server/node_modules/.bin/tsx')
  const proc = new Proc(
    'ts-server',
    spawn(tsx, ['src/index.ts'], {
      cwd: path.join(ROOT, 'server'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    path.join(options.workDir, 'ts-server.log'),
  )
  try {
    await proc.waitFor(/^Started: DEV MASTER/)
  } catch (error) {
    await proc.stop()
    await mongod.stop()
    throw error
  }
  const client = new MongoClient(mongoUri)
  await client.connect()
  return {
    kind: 'ts',
    url: `http://127.0.0.1:${port}`,
    proc,
    async promoteAdmin(userId) {
      const result = await client
        .db(dbName)
        .collection('user')
        .updateOne({id: userId}, {$set: {admin: true}})
      if (result.matchedCount !== 1) throw new Error(`ts: no user ${userId}`)
    },
    async stop() {
      await proc.stop()
      await client.close()
      await mongod.stop()
    },
  }
}

export const RUST_BINARY =
  process.env.RUST_SERVER_BIN ?? path.join(ROOT, 'rust/target/release/frisbee-server')

export async function startRustServer(options: TStartOptions): Promise<IServer> {
  if (!fs.existsSync(RUST_BINARY))
    throw new Error(
      `${RUST_BINARY} is missing: run \`cargo build --release\` in rust/ first.`,
    )
  const sqlitePath = path.join(options.workDir, 'rust', 'frisbee.sqlite')
  const port = await freePort()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...SHARED_ENV,
    ...(options.urlClient ? {URL_CLIENT: options.urlClient} : {}),
    SQLITE_PATH: sqlitePath,
    PORT: String(port),
    FRISBEE_ENV_DIR: options.workDir,
  }
  delete env.NODE_ENV
  const proc = new Proc(
    'rust-server',
    spawn(RUST_BINARY, [], {
      cwd: options.workDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    path.join(options.workDir, 'rust-server.log'),
  )
  await proc.waitFor(/^Started: DEV MASTER/)
  return {
    kind: 'rust',
    url: `http://127.0.0.1:${port}`,
    proc,
    async promoteAdmin(userId) {
      if (!/^[A-Za-z0-9]+$/.test(userId)) throw new Error(`bad id ${userId}`)
      const {stdout} = await execFileAsync('sqlite3', [
        '-cmd',
        '.timeout 5000',
        sqlitePath,
        `UPDATE user SET admin = 1 WHERE id = '${userId}'; SELECT changes();`,
      ])
      if (stdout.trim() !== '1') throw new Error(`rust: no user ${userId}`)
    },
    async stop() {
      await proc.stop()
    },
  }
}
