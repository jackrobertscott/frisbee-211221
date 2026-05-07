import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
import {io} from '@shared/torva'
import {$Report} from '../tables/$Report'
import {$Team} from '../tables/$Team'

const reportMvpFields = [
  'mvpMale',
  'mvpMale2',
  'mvpFemale',
  'mvpFemale2',
] as const satisfies readonly (keyof TReport)[]

const teamEmailValidator = io.string().trim().email().emptyok()
const idValidator = io.id()

export async function runFixSchemaAuditDataMigration() {
  const reportTasks = await getReportTasks()
  const teamTasks = await getTeamTasks()
  const totalTaskCount = reportTasks.length + teamTasks.length

  if (!totalTaskCount) {
    console.log('No schema audit data fixes required.')
    return
  }

  console.log('Running schema audit data migration...')

  printPlan('report', reportTasks)
  printPlan('team', teamTasks)

  await $Report.updateBulk(reportTasks)
  await $Team.updateBulk(teamTasks)

  console.log(
    `Applied ${reportTasks.length} report updates and ${teamTasks.length} team updates.`,
  )
}

async function getReportTasks() {
  const tasks: Array<{query: {id: string}; value: Partial<TReport>}> = []

  await $Report.scanStored((record) => {
    const report = record as Record<string, unknown>
    const value = reportMvpFields.reduce<Partial<TReport>>((all, field) => {
      const currentValue = report[field]
      const nextValue = sanitizeOptionalId(currentValue)
      if (currentValue !== nextValue) {
        all[field] = nextValue
      }
      return all
    }, {})

    if (!Object.keys(value).length) return

    tasks.push({
      query: {id: String(report.id)},
      value: {
        ...value,
        updatedOn: new Date().toISOString(),
      },
    })
  })

  return tasks
}

async function getTeamTasks() {
  const tasks: Array<{query: {id: string}; value: Partial<TTeam>}> = []

  await $Team.scanStored((record) => {
    const team = record as Record<string, unknown>
    const currentValue = team.email
    const nextValue = sanitizeOptionalEmail(currentValue)
    if (currentValue === nextValue) return

    tasks.push({
      query: {id: String(team.id)},
      value: {
        email: nextValue,
        updatedOn: new Date().toISOString(),
      },
    })
  })

  return tasks
}

function sanitizeOptionalId(value: unknown) {
  const result = idValidator.validate(value as never)
  return result.ok ? result.value : undefined
}

function sanitizeOptionalEmail(value: unknown) {
  const result = teamEmailValidator.validate(value as never)
  return result.ok ? result.value : undefined
}

function printPlan(
  table: 'report' | 'team',
  tasks: Array<{query: {id: string}; value: Partial<TReport> | Partial<TTeam>}>,
) {
  if (!tasks.length) {
    console.log(`No ${table} records require changes.`)
    return
  }

  console.log(`Prepared ${tasks.length} ${table} updates:`)
  for (const task of tasks) {
    console.log(`- ${task.query.id}: ${JSON.stringify(task.value, jsonReplacer)}`)
  }
}

function jsonReplacer(_key: string, value: unknown) {
  return value === undefined ? '[unset]' : value
}