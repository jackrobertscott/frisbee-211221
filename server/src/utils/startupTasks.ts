const startupTasks: Array<() => Promise<void>> = [
  // runStartupSchemaAudit // uncomment to enable Mongo schema audit on startup
]

export async function runStartupTasks() {
  for (const task of startupTasks) {
    await task()
  }
}
