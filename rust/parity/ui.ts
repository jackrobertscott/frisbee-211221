/**
 * UI run: builds the browser app against the Rust server, serves it with
 * `vite preview`, and drives the main flows in Chrome (playwright-core) at
 * phone width, then revisits every screen at desktop width. Any console
 * error, page error, failed request or unexpected HTTP error fails the run.
 * See README.md.
 */
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {Browser, BrowserContext, chromium, Page, Response} from 'playwright-core'
import {freePort, IServer, makeWorkDir, Proc, ROOT, startRustServer, startTsServer} from './servers'

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PHONE = {width: 390, height: 844}
const DESKTOP = {width: 1280, height: 860}
const PASSWORD = 'ui-password-1'

type TProblem = {where: string; what: string}

class Run {
  readonly problems: TProblem[] = []
  readonly pages: Array<[string, Page]> = []
  /** Requests the app cancelled (listed for comparison with a TS baseline run). */
  readonly aborted: string[] = []
  /** Expected error responses (path → reason), e.g. no season yet. */
  allow: Array<(response: Response) => boolean> = []
  step = 'start'

  constructor(
    readonly base: string,
    readonly server: IServer,
    readonly shotsDir: string,
  ) {}

  watch(page: Page, label: string) {
    page.on('console', (message) => {
      if (message.type() === 'error')
        this.fail(label, `console.error: ${message.text()}`)
    })
    page.on('pageerror', (error) => this.fail(label, `page error: ${error.message}`))
    page.on('requestfailed', (request) =>
      this.fail(label, `request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`),
    )
    page.on('response', (response) => {
      if (response.status() < 400) return
      if (this.allow.some((allowed) => allowed(response))) return
      this.fail(label, `HTTP ${response.status()} ${response.request().method()} ${response.url()}`)
    })
  }

  fail(label: string, what: string) {
    // Chrome logs "Failed to load resource" for every error response; those
    // are checked (and allowed or reported) by the response listener
    if (what.startsWith('console.error: Failed to load resource: the server responded')) return
    // requests the app cancels (unmounting a screen, leaving a page) are not failures
    if (what.startsWith('request failed:') && what.endsWith('net::ERR_ABORTED')) {
      this.aborted.push(`${label} @ ${this.step}: ${what}`)
      return
    }
    this.problems.push({where: `${label} @ ${this.step}`, what})
    console.log(`  ✗ ${label} @ ${this.step}: ${what}`)
  }

  async shot(page: Page, name: string) {
    await page.screenshot({path: path.join(this.shotsDir, `${name}.png`), fullPage: true})
  }

  async newPage(browser: Browser, label: string, viewport = PHONE): Promise<[BrowserContext, Page]> {
    const context = await browser.newContext({viewport, acceptDownloads: true})
    const page = await context.newPage()
    this.pages.push([label, page])
    this.watch(page, label)
    return [context, page]
  }
}

async function main() {
  const workDir = makeWorkDir('frisbee-ui-')
  const shotsDir = path.join(workDir, 'screenshots')
  fs.mkdirSync(shotsDir)
  console.log(`Work dir (logs, screenshots): ${workDir}`)
  const previewPort = await freePort()
  const clientOrigin = `http://localhost:${previewPort}`
  let server: IServer | undefined
  let preview: Proc | undefined
  let browser: Browser | undefined
  let failed = true
  try {
    // UI_SERVER=ts runs the same flows against the TS server, as a baseline
    server =
      process.env.UI_SERVER === 'ts'
        ? await startTsServer({workDir, urlClient: clientOrigin})
        : await startRustServer({workDir, urlClient: clientOrigin})
    console.log(`${server.kind} server ${server.url}`)
    const env = {
      ...process.env,
      VITE_URL_SERVER: server.url,
      VITE_URL_CLIENT: clientOrigin,
    }
    const vite = path.join(ROOT, 'browser/node_modules/.bin/vite')
    const dist = path.join(workDir, 'dist')
    const build = new Proc(
      'vite build',
      spawn(vite, ['build', '--outDir', dist, '--emptyOutDir'], {
        cwd: path.join(ROOT, 'browser'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      path.join(workDir, 'vite-build.log'),
    )
    await build.waitFor(/built in/, 180_000)
    preview = new Proc(
      'vite preview',
      spawn(vite, ['preview', '--outDir', dist, '--port', String(previewPort), '--strictPort'], {
        cwd: path.join(ROOT, 'browser'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      path.join(workDir, 'vite-preview.log'),
    )
    await preview.waitFor(/localhost:/)
    browser = await chromium.launch({executablePath: CHROME, headless: process.env.UI_HEADED ? false : true})
    const run = new Run(clientOrigin, server, shotsDir)
    try {
      await flows(run, browser)
    } catch (error) {
      run.fail('script', `${run.step}: ${String(error).split('\n')[0]}`)
      for (const [label, page] of run.pages) {
        await run.shot(page, `error-${label.replace(/\W+/g, '-')}`).catch(() => undefined)
        if (process.env.UI_DEBUG)
          console.log(`--- ${label} ${page.url()}\n${await page.locator('body').ariaSnapshot().catch(() => '')}`)
      }
    }
    failed = run.problems.length > 0
    console.log('')
    if (run.aborted.length) {
      console.log(`${run.aborted.length} request(s) cancelled by the app (not failures):`)
      for (const line of run.aborted) console.log(`  ${line}`)
    }
    if (failed) {
      console.log(`${run.problems.length} problem(s):`)
      for (const problem of run.problems) console.log(`  ${problem.where}: ${problem.what}`)
    }
    console.log(failed ? '\nUI RUN FAILED' : '\nUI RUN OK')
    console.log(`Screenshots: ${shotsDir}`)
  } catch (error) {
    console.error(error)
  } finally {
    await browser?.close()
    await preview?.stop()
    await server?.stop()
  }
  process.exit(failed ? 1 : 0)
}

// ------------------------------------------------------------------ helpers

async function waitForCode(server: IServer, email: string, after: number): Promise<string> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const codes = server.proc.codes.filter((c) => c.email === email)
    if (codes.length > after) return codes.at(-1)!.code.replace('-', '')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`No security code for ${email}`)
}

async function toast(page: Page, text: string | RegExp) {
  await page.getByRole('region', {name: 'Notifications'}).getByText(text).first().waitFor()
}

async function pick(page: Page, combobox: ReturnType<Page['getByRole']>, option: string | RegExp) {
  await combobox.click()
  await page.getByRole('option', {name: option}).first().click()
}

async function signUp(
  run: Run,
  page: Page,
  user: {email: string; firstName: string; lastName: string; gender: 'Male' | 'Female'},
) {
  run.step = `sign up ${user.email}`
  await page.goto(`${run.base}/auth/welcome`)
  await page.getByRole('textbox', {name: 'Email'}).fill(user.email)
  await page.getByRole('button', {name: 'Continue'}).click()
  await page.waitForURL('**/auth/sign-up')
  await page.getByRole('textbox', {name: 'First name'}).fill(user.firstName)
  await page.getByRole('textbox', {name: 'Last name'}).fill(user.lastName)
  await pick(page, page.getByRole('combobox', {name: 'Gender matching'}), user.gender)
  await page.getByRole('checkbox', {name: 'I accept the terms and conditions'}).click()
  const before = run.server.proc.codes.filter((c) => c.email === user.email).length
  const signedUp = page.waitForResponse((r) => r.url().endsWith('/SecuritySignUp'))
  await page.getByRole('button', {name: 'Sign up'}).click()
  const userId: string = (await (await signedUp).json()).user.id
  await page.waitForURL('**/auth/verify**')
  const code = await waitForCode(run.server, user.email, before)
  run.step = `verify ${user.email}`
  await page.getByRole('textbox', {name: 'Character 1 of 8'}).click()
  await page.keyboard.type(code)
  await page.getByRole('textbox', {name: 'Password'}).fill(PASSWORD)
  await page.getByRole('button', {name: 'Submit & log in'}).click()
  await toast(page, 'Email verified')
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'))
  return userId
}

async function logIn(run: Run, page: Page, email: string) {
  run.step = `log in ${email}`
  await page.goto(`${run.base}/auth/welcome`)
  await page.getByRole('textbox', {name: 'Email'}).fill(email)
  await page.getByRole('button', {name: 'Continue'}).click()
  await page.waitForURL('**/auth/login')
  await page.getByRole('textbox', {name: 'Password'}).fill(PASSWORD)
  await page.getByRole('button', {name: 'Log in'}).click()
  await toast(page, /Welcome back/)
}

async function logOut(run: Run, page: Page) {
  run.step = 'log out'
  await page.getByRole('button', {name: 'Log out'}).click()
  await page.getByRole('dialog').getByRole('button', {name: 'Log out'}).click()
  await page.waitForURL('**/auth/**')
}

async function closeDialogs(page: Page) {
  for (let i = 0; i < 3 && (await page.getByRole('dialog').count()); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

async function createTeam(run: Run, page: Page, name: string, division: string, colour: string) {
  run.step = `create team ${name}`
  await page.getByRole('main').getByRole('button', {name: 'Create team'}).click()
  const dialog = page.getByRole('dialog', {name: 'New team'})
  await dialog.getByRole('textbox', {name: 'Team name'}).fill(name)
  await dialog.getByRole('textbox', {name: /Public phone/}).fill('0400 000 000')
  await dialog.getByRole('spinbutton').fill(division)
  await dialog.getByRole('radio', {name: colour, exact: true}).click()
  await dialog.getByRole('contentinfo').getByRole('button', {name: 'Create team'}).click()
  await dialog.waitFor({state: 'hidden'})
  await page.getByRole('dialog', {name}).waitFor()
  await closeDialogs(page)
}

async function openTeamMembers(page: Page, team: string) {
  await page.getByRole('main').getByRole('row', {name: new RegExp(`^${team}\\b`)}).click()
  const dialog = page.getByRole('dialog', {name: team})
  await dialog.getByRole('tab', {name: 'Team members'}).click()
  return dialog
}

async function addMember(
  run: Run,
  page: Page,
  team: string,
  player: {email: string; firstName: string; lastName: string; gender: 'Male' | 'Female'},
) {
  run.step = `add ${player.firstName} to ${team}`
  const dialog = await openTeamMembers(page, team)
  await dialog.getByRole('button', {name: 'Add member'}).click()
  const add = page.getByRole('dialog', {name: 'Add member'})
  await add.getByRole('textbox', {name: 'Email'}).fill(player.email)
  await add.getByRole('button', {name: 'Continue'}).click()
  await add.getByRole('textbox', {name: 'First name'}).fill(player.firstName)
  await add.getByRole('textbox', {name: 'Last name'}).fill(player.lastName)
  await pick(page, add.getByRole('combobox', {name: 'Gender matching'}), player.gender)
  await add.getByRole('button', {name: 'Create & add'}).click()
  await add.waitFor({state: 'hidden'})
  await dialog.getByText(`${player.firstName} ${player.lastName}`).waitFor()
  await closeDialogs(page)
}

/** Visits a section and waits for its content (and any loading) to settle. */
async function visit(run: Run, page: Page, route: string, ready: string | RegExp) {
  run.step = `visit ${route}`
  await page.goto(`${run.base}${route}`)
  await page.getByRole('main').getByText(ready).first().waitFor()
  await page.waitForLoadState('networkidle')
}

// -------------------------------------------------------------------- flows

async function flows(run: Run, browser: Browser) {
  // the first visit to an empty database has no season yet (404, as on TS)
  let seasonCreated = false
  run.allow.push(
    (response) => response.url().endsWith('/SecurityCurrent') && response.status() === 404 && !seasonCreated,
  )

  const [, admin] = await run.newPage(browser, 'admin (phone)')
  await admin.goto(run.base)
  await admin.getByRole('heading', {name: 'Welcome'}).waitFor()
  await run.shot(admin, 'phone-welcome')
  const adminId = await signUp(run, admin, {email: 'ada@example.com', firstName: 'Ada', lastName: 'Admin', gender: 'Female'})
  await admin.getByText('Season not ready').waitFor()
  // promote with a database write, then sign in again to pick up the role
  await run.server.promoteAdmin(adminId)
  await logOut(run, admin)
  await logIn(run, admin, 'ada@example.com')

  run.step = 'create season'
  await admin.getByRole('button', {name: 'Create season'}).click()
  const seasonDialog = admin.getByRole('dialog', {name: 'New season'})
  await seasonDialog.getByRole('textbox', {name: 'Name'}).fill('Summer 2028')
  await seasonDialog.getByRole('switch', {name: 'Sign up open'}).click()
  await seasonDialog.getByRole('button', {name: 'Create season'}).click()
  seasonCreated = true
  await admin.getByRole('main').getByRole('button', {name: 'Magic generate'}).first().waitFor()

  await visit(run, admin, '/teams', 'No teams yet')
  const teams: Array<[string, string, string]> = [
    ['Alpha', '1', 'Colour 3'],
    ['Bravo', '1', 'Colour 7'],
    ['Charlie', '2', 'Colour 12'],
    ['Delta', '2', 'Colour 20'],
  ]
  for (const [name, division, colour] of teams) await createTeam(run, admin, name, division, colour)
  const roster: Record<string, Array<{email: string; firstName: string; lastName: string; gender: 'Male' | 'Female'}>> = {
    Alpha: [{email: 'amy@example.com', firstName: 'Amy', lastName: 'Archer', gender: 'Female'}],
    Bravo: [
      {email: 'bea@example.com', firstName: 'Bea', lastName: 'Baker', gender: 'Female'},
      {email: 'ben@example.com', firstName: 'Ben', lastName: 'Baker', gender: 'Male'},
    ],
    Charlie: [{email: 'cat@example.com', firstName: 'Cat', lastName: 'Cole', gender: 'Female'}],
    Delta: [{email: 'dan@example.com', firstName: 'Dan', lastName: 'Dunn', gender: 'Male'}],
  }
  for (const [team, players] of Object.entries(roster))
    for (const player of players) await addMember(run, admin, team, player)
  await run.shot(admin, 'phone-teams')

  run.step = 'generate fixtures'
  await visit(run, admin, '/fixtures', 'No fixtures yet')
  await admin.getByRole('main').getByRole('button', {name: 'Magic generate'}).first().click()
  const generate = admin.getByRole('dialog', {name: 'Generate fixtures'})
  await generate.getByRole('spinbutton').fill('3')
  await generate.getByRole('button', {name: /Starting date/}).click()
  await admin.getByRole('dialog', {name: 'Choose date'}).getByRole('button', {name: /, 20 /}).click()
  await generate.getByRole('textbox', {name: 'Slot 1 time'}).fill('6:00pm')
  await generate.getByRole('textbox', {name: 'Slot 1 place'}).fill('Field 1')
  await generate.getByRole('button', {name: 'Add slot'}).click()
  await generate.getByRole('textbox', {name: 'Slot 2 time'}).fill('7:00pm')
  await generate.getByRole('textbox', {name: 'Slot 2 place'}).fill('Field 2')
  await generate.getByRole('button', {name: 'Generate'}).click()
  await generate.waitFor({state: 'hidden'})
  await admin.getByRole('table', {name: 'Round 3 games'}).waitFor()
  await run.shot(admin, 'phone-fixtures')

  // a player signs up, asks to join Alpha, and becomes its captain
  const [, player] = await run.newPage(browser, 'player (phone)')
  await signUp(run, player, {email: 'pete@example.com', firstName: 'Pete', lastName: 'Player', gender: 'Male'})
  run.step = 'join team'
  await player.getByRole('button', {name: 'Join a team'}).click()
  const join = player.getByRole('dialog', {name: 'Join a team'})
  await join.getByRole('listitem').filter({hasText: 'Alpha'}).getByRole('button', {name: 'Request to join'}).click()
  await player.getByRole('dialog', {name: 'Join Alpha?'}).getByRole('button', {name: 'Join team'}).click()
  await toast(player, /Request successfully created/)
  await closeDialogs(player)
  await run.shot(player, 'phone-player-pending')

  run.step = 'accept request'
  await visit(run, admin, '/teams', 'Alpha')
  let members = await openTeamMembers(admin, 'Alpha')
  await members.getByRole('button', {name: 'Accept'}).click()
  await toast(admin, 'Membership request accepted.')
  await members.getByRole('button', {name: 'Set Pete Player as captain'}).click()
  const promote = admin.getByRole('dialog', {name: 'Set Pete Player as captain?'})
  await promote.getByRole('contentinfo').getByRole('button').last().click()
  await members.getByText('Captain').waitFor()
  await run.shot(admin, 'phone-team-members')
  await closeDialogs(admin)

  run.step = 'captain reports'
  await player.reload()
  await player.getByRole('navigation', {name: 'Sections'}).waitFor()
  await player.getByRole('button', {name: /^Report( score)?$/}).filter({visible: true}).first().click()
  const report = player.getByRole('dialog').filter({hasText: /report/i}).first()
  await report.waitFor()
  await pick(player, report.getByRole('combobox', {name: 'Fixture'}), /Round 1/)
  await pick(player, report.getByRole('combobox', {name: 'Opponent'}), /Bravo/)
  await report.getByRole('spinbutton', {name: /Your score/}).fill('13')
  await report.getByRole('spinbutton', {name: /Opponent score/}).fill('11')
  const mvps = report.getByRole('combobox', {name: /MVP/})
  if (await mvps.count()) {
    await pick(player, mvps.nth(0), /Ben Baker|Bea Baker/)
    if ((await mvps.count()) > 1) await pick(player, mvps.nth(1), /Bea Baker|Ben Baker/)
  }
  const spirit = report.getByRole('radiogroup', {name: 'Spirit score'})
  if (await spirit.count()) await spirit.getByRole('radio').nth(2).click()
  await report.getByRole('textbox', {name: /Comment/}).fill('Great game')
  await run.shot(player, 'phone-report-form')
  await report.getByRole('button', {name: /Submit/}).click()
  await toast(player, /report|submitted|thank/i)
  await closeDialogs(player)

  // admin dashboards
  for (const [route, ready] of [
    ['/ladder', 'Alpha'],
    ['/fixtures', 'Round 1'],
    ['/reports', '13–11'],
    ['/spirit', 'Alpha'],
    ['/mvp', 'Baker'],
    ['/teams', 'Alpha'],
    ['/users', 'Pete'],
    ['/port', 'Export data'],
  ] as const) {
    await visit(run, admin, route, ready)
    await run.shot(admin, `phone${route.replace('/', '-')}`)
  }

  run.step = 'sort tables'
  await visit(run, admin, '/teams', 'Alpha')
  for (const column of ['Team', 'Division']) {
    await admin.getByRole('columnheader', {name: column}).getByRole('button').click()
    await admin.waitForLoadState('networkidle')
    await admin.getByRole('columnheader', {name: column}).getByRole('button').click()
    await admin.waitForLoadState('networkidle')
  }
  await visit(run, admin, '/spirit', 'Alpha')
  const spiritHeaders = admin.getByRole('columnheader').getByRole('button')
  for (let i = 0; i < (await spiritHeaders.count()); i++) {
    await spiritHeaders.nth(i).click()
    await admin.waitForLoadState('networkidle')
  }

  run.step = 'user management'
  await visit(run, admin, '/users', 'Pete')
  await admin.getByRole('searchbox').first().fill('baker')
  await admin.getByRole('main').getByText('Ben').first().waitFor()
  await admin.waitForLoadState('networkidle')
  const userHeaders = admin.getByRole('columnheader').getByRole('button')
  for (let i = 0; i < (await userHeaders.count()); i++) {
    await userHeaders.nth(i).click()
    await admin.waitForLoadState('networkidle')
  }
  await admin.getByRole('main').getByRole('row', {name: /Ben/}).first().click()
  const userDialog = admin.getByRole('dialog').first()
  await userDialog.waitFor()
  await run.shot(admin, 'phone-user-dialog')
  const tabs = userDialog.getByRole('tab')
  for (let i = 0; i < (await tabs.count()); i++) {
    await tabs.nth(i).click()
    await admin.waitForLoadState('networkidle')
  }
  await closeDialogs(admin)

  run.step = 'port export'
  await visit(run, admin, '/port', 'Export data')
  for (const type of ['CSV', 'JSON']) {
    await admin.getByRole('main').getByText('Export data').first().click()
    const exportDialog = admin.getByRole('dialog', {name: 'Export data'})
    await exportDialog.getByRole('radio', {name: new RegExp(`^${type}`)}).click()
    const download = admin.waitForEvent('download')
    await exportDialog.getByRole('button', {name: 'Export'}).click()
    const file = await download
    const saved = path.join(run.shotsDir, `export-${type.toLowerCase()}.zip`)
    await file.saveAs(saved)
    if (fs.statSync(saved).size < 100) run.fail('admin (phone)', `export ${type} is too small`)
    await toast(admin, 'Export downloaded.')
    await closeDialogs(admin)
  }

  // the same screens at desktop width
  const [, desktop] = await run.newPage(browser, 'admin (desktop)', DESKTOP)
  await logIn(run, desktop, 'ada@example.com')
  for (const [route, ready] of [
    ['/ladder', 'Alpha'],
    ['/fixtures', 'Round 1'],
    ['/reports', '13–11'],
    ['/spirit', 'Alpha'],
    ['/mvp', 'Baker'],
    ['/teams', 'Alpha'],
    ['/users', 'Pete'],
    ['/port', 'Export data'],
  ] as const) {
    await visit(run, desktop, route, ready)
    await run.shot(desktop, `desktop${route.replace('/', '-')}`)
  }
  run.step = 'desktop report dialog'
  await visit(run, desktop, '/reports', '13–11')
  await desktop.getByRole('main').getByRole('row', {name: /13–11/}).first().click()
  await desktop.getByRole('dialog').first().waitFor()
  await desktop.waitForLoadState('networkidle')
  await run.shot(desktop, 'desktop-report-dialog')
  await closeDialogs(desktop)

  const [, playerDesktop] = await run.newPage(browser, 'player (desktop)', DESKTOP)
  await logIn(run, playerDesktop, 'pete@example.com')
  await playerDesktop.getByRole('navigation', {name: 'Sections'}).waitFor()
  await playerDesktop.waitForLoadState('networkidle')
  await run.shot(playerDesktop, 'desktop-player-home')
}

void main()
