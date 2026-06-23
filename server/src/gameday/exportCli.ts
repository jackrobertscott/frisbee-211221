import {exportGamedayMembers} from './exporter'
import {parseGamedayExportInput} from './types'

const readStdin = async () => {
  process.stdin.setEncoding('utf8')
  let data = ''
  for await (const chunk of process.stdin) {
    data += chunk
  }
  return data
}

const main = async () => {
  const text = await readStdin()
  const parsed: unknown = JSON.parse(text)
  const input = parseGamedayExportInput(parsed)
  const result = await exportGamedayMembers(input)
  process.stdout.write(JSON.stringify(result))
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`GameDay export failed: ${message}`)
  process.exitCode = 1
})
