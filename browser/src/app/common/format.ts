/* Date and name formatting shared across the league app. */
type TDateInput = string | number | Date

const asDate = (d: TDateInput) => (d instanceof Date ? d : new Date(d))

export const fmtDate = (d: TDateInput) =>
  new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(asDate(d))

export const fmtShort = (d: TDateInput) =>
  new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(asDate(d))

export const fmtDateTime = (d: TDateInput) =>
  new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(asDate(d))

export const fullName = (u: {firstName: string; lastName: string}) =>
  `${u.firstName} ${u.lastName}`.trim()

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && !/^the$/i.test(w))
    .map((w) => w[0])
    .join('')
    .toUpperCase()
