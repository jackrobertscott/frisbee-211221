import {TypeIoAll} from '@shared/torva'
import {$AuthAttemptLimit} from '../tables/$AuthAttemptLimit'
import {$Comment} from '../tables/$Comment'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Post} from '../tables/$Post'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Session} from '../tables/$Session'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'

type TSchemaAuditTable = {
  key(): string
  validator(): TypeIoAll
  scanStored(callback: (value: unknown) => Promise<void> | void): Promise<number>
}

const tables: TSchemaAuditTable[] = [
  $AuthAttemptLimit,
  $Comment,
  $Fixture,
  $Member,
  $Post,
  $Report,
  $Season,
  $Session,
  $Team,
  $User,
]

const ROOT_FAILURE = '(root)'

export async function runStartupSchemaAudit() {
  console.log('Running Mongo schema audit...')

  const lines = ['Mongo schema audit results:']

  for (const table of tables) {
    const propertyCounts = new Map<string, number>()
    let total = 0
    let invalid = 0

    await table.scanStored((record) => {
      total += 1
      const failures = collectFailurePaths(table.validator(), record)
      if (!failures.length) return

      invalid += 1
      for (const property of new Set(failures.map(normalizeFailurePath))) {
        propertyCounts.set(property, (propertyCounts.get(property) ?? 0) + 1)
      }
    })

    if (!invalid) {
      lines.push(`- ${table.key()}: ✓`)
      continue
    }

    lines.push(`- ${table.key()}: ${invalid} invalid of ${total}`)
    for (const [property, count] of [...propertyCounts.entries()].sort(sortCounts)) {
      lines.push(`  - ${property}: ${count}`)
    }
  }

  console.log(lines.join('\n'))
}

function collectFailurePaths(schema: TypeIoAll, value: unknown, path = ''): string[] {
  switch (schema._type) {
    case 'object':
      if (!isPlainObject(value)) return [path || ROOT_FAILURE]
      return Object.entries(schema.shape).flatMap(([key, childSchema]) =>
        collectFailurePaths(
          childSchema,
          value[key],
          appendPath(path, key),
        ),
      )
    case 'array':
      if (!Array.isArray(value)) return [path || ROOT_FAILURE]
      return value.flatMap((item, index) =>
        collectFailurePaths(schema.ofType, item, appendPath(path, String(index))),
      )
    case 'lazy':
      return collectFailurePaths(schema.getType(), value, path)
    case 'null':
      if (value === null) return []
      return collectFailurePaths(schema.ofType, value, path)
    case 'optional':
      if (value === undefined) return []
      return collectFailurePaths(schema.ofType, value, path)
    default:
      return schema.validate(value as never).ok ? [] : [path || ROOT_FAILURE]
  }
}

function appendPath(path: string, next: string) {
  return path ? `${path}.${next}` : next
}

function normalizeFailurePath(path: string) {
  const parts = path
    .split('.')
    .filter(Boolean)
    .filter((part) => !/^\d+$/.test(part))
  return parts.length ? parts.join('.') : ROOT_FAILURE
}

function sortCounts(
  left: [string, number],
  right: [string, number],
) {
  if (right[1] !== left[1]) return right[1] - left[1]
  return left[0].localeCompare(right[0])
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(typeof value === 'object' && value !== null && !Array.isArray(value))
}