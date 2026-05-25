import {runStartupIndexSync} from './startupIndexes'
import config from '../config'

type TStartupTask = {
  name: string
  run(): Promise<void>
}

const STARTUP_TASK_RETRY_TIMEOUT_MS = 4 * 60 * 1000
const STARTUP_TASK_RETRY_INITIAL_DELAY_MS = 1000
const STARTUP_TASK_RETRY_MAX_DELAY_MS = 10000

const startupTasks: TStartupTask[] = [
  {
    name: 'Mongo index sync',
    run: runStartupIndexSync,
  },
  // runStartupSchemaAudit // uncomment to enable Mongo schema audit on startup
]

export async function runStartupTasks() {
  for (const task of startupTasks) {
    await runStartupTask(task)
  }
}

async function runStartupTask(task: TStartupTask) {
  if (!config.IS_PRODUCTION) {
    await task.run()
    return
  }

  const startedAt = Date.now()
  let attempt = 1
  let retryDelayMs = STARTUP_TASK_RETRY_INITIAL_DELAY_MS

  while (true) {
    try {
      await task.run()
      if (attempt > 1)
        console.log(
          `Startup task "${task.name}" succeeded after ${attempt} attempts.`,
        )
      return
    } catch (error) {
      const elapsedMs = Date.now() - startedAt
      const retryBudgetRemainingMs =
        STARTUP_TASK_RETRY_TIMEOUT_MS - elapsedMs

      if (retryBudgetRemainingMs <= 0) throw error

      const waitMs = Math.min(retryDelayMs, retryBudgetRemainingMs)
      console.warn(
        [
          `Startup task "${task.name}" failed on attempt ${attempt}.`,
          `Retrying in ${waitMs}ms.`,
          formatStartupTaskError(error),
        ].join(' '),
      )

      await sleep(waitMs)
      attempt += 1
      retryDelayMs = Math.min(
        retryDelayMs * 2,
        STARTUP_TASK_RETRY_MAX_DELAY_MS,
      )
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function formatStartupTaskError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
