import {$Session} from '../tables/$Session'

export async function runStartupSessionMigration() {
  console.log('Running session schema migration...')

  let scanned = 0
  let alreadyValid = 0
  let migrated = 0
  let deleted = 0

  await $Session.scanStored(async (record) => {
    scanned += 1

    const validation = $Session.validator().validate(record as never)
    if (validation.ok) {
      alreadyValid += 1
      return
    }

    const session = record as {id?: unknown; expiresOn?: unknown}
    if (typeof session.id !== 'string') return

    const expiresOn = normalizeLegacyDate(session.expiresOn)

    if (expiresOn) {
      await $Session.updateOne({id: session.id}, {expiresOn})
      migrated += 1
      return
    }

    await $Session.deleteOne({id: session.id})
    deleted += 1
  })

  console.log(
    [
      'Session schema migration results:',
      `- scanned: ${scanned}`,
      `- already valid: ${alreadyValid}`,
      `- migrated: ${migrated}`,
      `- deleted: ${deleted}`,
    ].join('\n'),
  )
}

function normalizeLegacyDate(value: unknown) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString()
  }

  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? undefined : value.toISOString()
  }

  return undefined
}