export const parseCSVRows = (csv: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let token = ''
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]

    if (char === '"') {
      if (inQuotes && csv[index + 1] === '"') {
        token += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(token)
      token = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      row.push(token)
      rows.push(row)
      row = []
      token = ''
      if (char === '\r' && csv[index + 1] === '\n') index += 1
      continue
    }

    token += char
  }

  if (token.length || row.length || csv.endsWith(',')) {
    row.push(token)
    rows.push(row)
  }

  return rows
}

export const parseCSVString = (csv: string): Record<string, string>[] => {
  const rows = parseCSVRows(csv).filter((row) =>
    row.some((token) => token.trim().length > 0),
  )
  const [head, ...body] = rows
  if (!head) return []
  const cols = head.map((token) => token.trim().replace(/^\uFEFF/, ''))
  return body.map((tokens) => {
    return cols.reduce<Record<string, string>>((all, key, index) => {
      all[key] = (tokens[index] ?? '').trim()
      return all
    }, {})
  })
}

export const csvEscape = (value: unknown) => {
  const stringValue = String(value ?? '')
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

export const replaceCSVHeader = (csvBuffer: Buffer, headers: string[]) => {
  const text = csvBuffer.toString('utf8')
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : ''
  const body = bom ? text.slice(1) : text
  const firstRecordEnd = findFirstCSVRecordEnd(body)
  const newHeader = headers.map(csvEscape).join(',')
  return Buffer.from(`${bom}${newHeader}${body.slice(firstRecordEnd)}`, 'utf8')
}

const findFirstCSVRecordEnd = (text: string) => {
  let inQuotes = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (!inQuotes && char === '\n') return index
  }
  return text.length
}
