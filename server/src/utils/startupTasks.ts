import {runStartupSchemaAudit} from './startupSchemaAudit'

const startupTasks = [runStartupSchemaAudit]

export async function runStartupTasks() {
  for (const task of startupTasks) {
    await task()
  }
}