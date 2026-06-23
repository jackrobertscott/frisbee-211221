import {
  badRequestError,
  internalError,
  serviceUnavailableError,
} from '@shared/errors'
import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {isGamedayExportOutput} from './types'
import type {TGamedayExportInput, TGamedayExportOutput} from './types'

const DEFAULT_PROCESS_TIMEOUT_MS = 10 * 60 * 1000
const MAX_OUTPUT_LENGTH = 50 * 1024 * 1024

interface TCliCommand {
  command: string
  args: string[]
  cwd: string
}

export const runGamedayExportProcess = async (
  input: TGamedayExportInput,
): Promise<TGamedayExportOutput> => {
  const cli = resolveCliCommand()

  return await new Promise<TGamedayExportOutput>((resolve, reject) => {
    const child = spawn(cli.command, cli.args, {
      cwd: cli.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timeout: ReturnType<typeof setTimeout>

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }

    child.stdin.on('error', () => undefined)

    timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish(() => {
        reject(
          serviceUnavailableError('GameDay export timed out.', {
            errorCode: 'gameday.export_timeout',
            userMessage:
              'GameDay took too long to finish the export. Please try again later.',
          }),
        )
      })
    }, readProcessTimeoutMs())

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      if (stdout.length > MAX_OUTPUT_LENGTH) {
        child.kill('SIGTERM')
        finish(() => {
          reject(
            internalError('GameDay export output was too large.', {
              errorCode: 'gameday.output_too_large',
            }),
          )
        })
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > MAX_OUTPUT_LENGTH) {
        stderr = stderr.slice(-MAX_OUTPUT_LENGTH)
      }
    })

    child.on('error', (error) => {
      finish(() => {
        reject(
          internalError('Failed to start the GameDay export process.', {
            errorCode: 'gameday.process_start_failed',
            cause: error,
          }),
        )
      })
    })

    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(
            badRequestError(readFailureMessage(stderr), {
              errorCode: 'gameday.export_failed',
              userMessage:
                'GameDay export failed. Please check the GameDay details and try again.',
              details: readOutputTail(stderr),
            }),
          )
          return
        }

        try {
          const parsed: unknown = JSON.parse(stdout)
          if (!isGamedayExportOutput(parsed)) {
            throw new Error('GameDay process returned an invalid response.')
          }
          resolve(parsed)
        } catch (error) {
          reject(
            internalError('Failed to read the GameDay export response.', {
              errorCode: 'gameday.response_invalid',
              cause: error,
              details: readOutputTail(stdout),
            }),
          )
        }
      })
    })

    child.stdin.end(JSON.stringify(input))
  })
}

const resolveCliCommand = (): TCliCommand => {
  const currentFile = fileURLToPath(import.meta.url)
  const currentDir = path.dirname(currentFile)
  const parts = currentDir.split(path.sep)
  const distIndex = parts.lastIndexOf('dist')
  if (distIndex !== -1) {
    const distDir = parts.slice(0, distIndex + 1).join(path.sep) || path.sep
    return {
      command: process.execPath,
      args: [path.join(distDir, 'gameday', 'exportCli.js')],
      cwd: path.dirname(distDir),
    }
  }

  const srcIndex = parts.lastIndexOf('src')
  const serverRoot =
    srcIndex === -1
      ? process.cwd()
      : parts.slice(0, srcIndex).join(path.sep) || path.sep
  return {
    command: process.execPath,
    args: [
      '--import',
      'tsx',
      path.join(serverRoot, 'src', 'gameday', 'exportCli.ts'),
    ],
    cwd: serverRoot,
  }
}

const readFailureMessage = (stderr: string) => {
  const tail = readOutputTail(stderr)
  return tail ? `GameDay export failed. ${tail}` : 'GameDay export failed.'
}

const readOutputTail = (value: string) => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join('\n')
}

const readProcessTimeoutMs = () => {
  const value =
    process.env.GAMEDAY_PROCESS_TIMEOUT_MS ?? process.env.GAMEDAY_TIMEOUT_MS
  if (!value?.trim()) return DEFAULT_PROCESS_TIMEOUT_MS
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PROCESS_TIMEOUT_MS
}
