/**
 * Differential parity run: starts the TS server (on a throwaway mongod) and
 * the Rust server (on a fresh SQLite file), drives both through the scenario
 * and exits non-zero on any difference. See README.md.
 */
import fs from 'node:fs'
import {ENDPOINT_DEFS, Harness} from './harness'
import {runScenario} from './scenario'
import {IServer, makeWorkDir, startRustServer, startTsServer} from './servers'

async function main() {
  const workDir = makeWorkDir('frisbee-parity-')
  console.log(`Work dir (server logs, databases): ${workDir}`)
  let ts: IServer | undefined
  let rust: IServer | undefined
  let failed = true
  try {
    ;[ts, rust] = await Promise.all([
      startTsServer({workDir}),
      startRustServer({workDir}),
    ])
    console.log(`TS server ${ts.url}, Rust server ${rust.url}`)
    const h = new Harness(ts, rust)
    await runScenario(h)

    const uncovered = [...ENDPOINT_DEFS.keys()].filter((path) => !h.called.has(path))
    console.log('')
    console.log(`Steps: ${h.steps}; endpoints covered: ${h.called.size}/${ENDPOINT_DEFS.size}`)
    if (uncovered.length) console.log(`Endpoints never called: ${uncovered.join(', ')}`)
    if (h.mismatches.length) {
      console.log(`\n${h.mismatches.length} step(s) differ:`)
      for (const mismatch of h.mismatches) {
        console.log(`  ${mismatch.step} (${mismatch.path})`)
        for (const problem of mismatch.problems) console.log(`      ${problem}`)
      }
    }
    failed = h.mismatches.length > 0 || uncovered.length > 0
    console.log(failed ? '\nPARITY FAILED' : '\nPARITY OK')
  } catch (error) {
    console.error(error)
  } finally {
    await Promise.all([ts?.stop(), rust?.stop()])
    if (!failed && !process.env.PARITY_KEEP) fs.rmSync(workDir, {recursive: true, force: true})
  }
  process.exit(failed ? 1 : 0)
}

void main()
