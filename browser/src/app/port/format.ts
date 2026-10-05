import {TGamedayImportRun} from '@shared/schemas/ioGamedayImport'

const pad = (n: number) => n.toString().padStart(2, '0')

export const fmtRunDate = (value: string) =>
  new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))

export const fmtOptionalRunDate = (value?: string) =>
  value ? fmtRunDate(value) : '—'

export const fmtRunTrigger = (value: TGamedayImportRun['trigger']) =>
  value === 'scheduled' ? 'Scheduled' : 'Manual'

export const fmtRunStatus = (value: TGamedayImportRun['status']) => {
  if (value === 'succeeded') return 'Succeeded'
  if (value === 'failed') return 'Failed'
  return 'Running'
}

export const fmtRunNumber = (value?: number) =>
  value === undefined ? '—' : value.toString()

export const fmtRunTime = (value?: string) => {
  if (!value) return '12:00am'
  const d = new Date(value)
  const h = d.getHours()
  return `${h % 12 || 12}:${pad(d.getMinutes())}${h < 12 ? 'am' : 'pm'}`
}

/** YYYY-MM-DD-HHmmss in local time, for export filenames. */
export const fileStamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

/** Applies the picked calendar day to an ISO value, keeping its time of day (as the legacy picker did). */
export const withPickedDay = (picked: Date, previous?: string) => {
  const next = previous ? new Date(previous) : new Date(picked)
  if (!previous) next.setHours(0, 0, 0, 0)
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return next.toISOString()
}
