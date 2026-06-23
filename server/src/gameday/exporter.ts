import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  chromium,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
  type Page,
} from 'playwright-core'
import {parseCSVRows, replaceCSVHeader} from '../utils/csv'
import type {
  TGamedayExportInput,
  TGamedayExportMember,
  TGamedayExportOutput,
} from './types'

type TGamedayMemberHeader =
  | 'Team Name'
  | 'First Name'
  | 'Family Name'
  | 'Email'
  | 'Gender'

interface TGamedayFieldDefinition {
  header: TGamedayMemberHeader
  preferredIds: string[]
  matches: (label: string) => boolean
}

interface TGamedayAvailableField {
  id: string
  label: string
  selected: boolean
}

interface TGamedayResolvedField {
  id: string
  header: string
  sourceLabel: string
}

interface TGamedayResolvedOptions {
  startingUrl: string
  username: string
  password: string
  association: string
  competition: string
  headless: boolean
  browserChannel: string
  browserExecutablePath?: string
  reportId: string
  timeoutMs: number
  debugDir?: string
  fields: string[]
  headers: string[]
  genderField?: string
  recordFilter: string
  normalizeHeaders: boolean
}

interface TGamedayReportRequest {
  action: string
  body: string
  client: string
  selectedIds: string[]
  jobId: string
}

interface TGamedayCompetitionListItem {
  title: string
  selectLink: string
  seasonName: string
  fixtureType: string
  teams: string
  abbreviation: string
  status: string
  id: string
}

interface TGamedayCompetitionSeasonFilterResult {
  found: boolean
  changed: boolean
  label: string
  previousLabel: string
  selectedLabel: string
}

// GameDay sometimes appends a footer row like "525 rows" after the CSV body.
const GAMEDAY_SUMMARY_ROW_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})*)\s+rows?$/i

const DEFAULT_FIELD_DEFS: TGamedayFieldDefinition[] = [
  {
    header: 'Team Name',
    preferredIds: ['strTeamName'],
    matches: (label) => normalizeLabel(label) === 'team name',
  },
  {
    header: 'First Name',
    preferredIds: ['strFirstname'],
    matches: (label) => normalizeLabel(label) === 'first name',
  },
  {
    header: 'Family Name',
    preferredIds: ['strSurname'],
    matches: (label) => normalizeLabel(label) === 'family name',
  },
  {
    header: 'Email',
    preferredIds: ['strEmail'],
    matches: (label) => normalizeLabel(label) === 'email',
  },
  {
    header: 'Gender',
    preferredIds: ['strGender', 'Gender', 'intGender', 'intGenderID'],
    matches: (label) => {
      const normalized = normalizeLabel(label)
      return (
        normalized === 'gender' ||
        (normalized.includes('gender') &&
          !normalized.includes('parent') &&
          !normalized.includes('guardian'))
      )
    },
  },
]

const COMMON_BROWSER_PATHS = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

const log = (message: string) => console.error(message)

export const exportGamedayMembers = async (
  input: TGamedayExportInput,
): Promise<TGamedayExportOutput> => {
  const options = resolveOptions(input)
  let browser: Browser | undefined
  let context: BrowserContext | undefined

  try {
    browser = await launchBrowser({
      headless: options.headless,
      browserChannel: options.browserChannel,
      browserExecutablePath: options.browserExecutablePath,
    })
    context = await browser.newContext({acceptDownloads: true})
    await installBrowserEvaluateNameHelper(context)
    const page = await context.newPage()

    await login(page, options)
    await selectAssociation(page, options.association, options.debugDir)
    await selectCompetition(page, options.competition, options.debugDir)
    await openAdvancedMemberReport(page, options.reportId, options.debugDir)

    const availableFields = await collectAvailableFields(page)
    const fields = resolveFields(availableFields, options)
    await configureReport(page, fields, options.recordFilter)

    const jobId = crypto.randomUUID()
    const request = await buildReportRequest(page, jobId)
    let csvBuffer = await runReportAndDownload(
      context.request,
      request,
      options.timeoutMs,
    )
    if (options.normalizeHeaders) {
      csvBuffer = replaceCSVHeader(
        csvBuffer,
        fields.map((field) => field.header),
      )
    }

    const members = parseMemberRows(csvBuffer)
    log(`Exported ${members.length} GameDay member row(s).`)
    return {members}
  } finally {
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}

const resolveOptions = (
  input: TGamedayExportInput,
): TGamedayResolvedOptions => {
  const debug = input.debug ?? parseBool(process.env.GAMEDAY_DEBUG, false)
  const debugDir = debug
    ? (process.env.GAMEDAY_DEBUG_DIR ?? path.join(process.cwd(), 'gameday-debug'))
    : undefined

  return {
    startingUrl: input.startingUrl,
    username: input.username,
    password: input.password,
    association: input.association,
    competition: input.competition,
    headless:
      input.headless ??
      parseBool(process.env.GAMEDAY_HEADLESS ?? process.env.HEADLESS, true),
    browserChannel:
      input.browserChannel ??
      process.env.GAMEDAY_BROWSER_CHANNEL ??
      process.env.BROWSER_CHANNEL ??
      'chrome',
    browserExecutablePath:
      input.browserExecutablePath ??
      process.env.GAMEDAY_BROWSER_EXECUTABLE_PATH ??
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
      process.env.CHROME_PATH,
    reportId:
      input.reportId ??
      process.env.GAMEDAY_REPORT_ID ??
      process.env.REPORT_ID ??
      '3',
    timeoutMs:
      input.timeoutMs ??
      readNumberEnv(
        process.env.GAMEDAY_TIMEOUT_MS ?? process.env.REPORT_TIMEOUT_MS,
        300_000,
      ),
    debugDir,
    fields: input.fields?.length
      ? input.fields
      : splitCsvLike(process.env.GAMEDAY_FIELDS ?? process.env.FIELD_IDS ?? ''),
    headers: input.headers?.length
      ? input.headers
      : splitCsvLike(
          process.env.GAMEDAY_HEADERS ?? process.env.OUTPUT_HEADERS ?? '',
        ),
    genderField: process.env.GAMEDAY_GENDER_FIELD ?? process.env.GENDER_FIELD_ID,
    recordFilter:
      process.env.GAMEDAY_RECORD_FILTER ?? process.env.RECORD_FILTER ?? 'DISTINCT',
    normalizeHeaders: parseBool(
      process.env.GAMEDAY_NORMALIZE_HEADERS ?? process.env.NORMALIZE_HEADERS,
      true,
    ),
  }
}

const splitCsvLike = (value: string) => {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

const parseBool = (value: unknown, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  return fallback
}

const readNumberEnv = (value: string | undefined, fallback: number) => {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeLabel = (value: string) => {
  return String(value || '')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const normalizeHeader = (value: string) => {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

const escapeRegex = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const resolveUrl = (href: string, baseUrl: string) => {
  return new URL(href, baseUrl).href
}

const launchBrowser = async ({
  headless,
  browserChannel,
  browserExecutablePath,
}: {
  headless: boolean
  browserChannel: string
  browserExecutablePath?: string
}) => {
  const executablePath = await resolveBrowserExecutablePath(browserExecutablePath)
  const launchOptions: LaunchOptions = {
    headless,
    args: browserLaunchArgs(),
  }
  if (executablePath) {
    launchOptions.executablePath = executablePath
  } else if (browserChannel && browserChannel !== 'bundled') {
    launchOptions.channel = browserChannel
  }

  try {
    return await chromium.launch(launchOptions)
  } catch (error) {
    if (launchOptions.channel) {
      log(
        `Could not launch browser channel "${launchOptions.channel}"; trying bundled Chromium.`,
      )
      return await chromium.launch({headless, args: browserLaunchArgs()})
    }
    throw error
  }
}

const resolveBrowserExecutablePath = async (explicitPath?: string) => {
  if (explicitPath?.trim()) {
    const normalizedPath = explicitPath.trim()
    if (await fileExists(normalizedPath)) return normalizedPath
    throw new Error(`Configured browser executable was not found: ${normalizedPath}`)
  }

  for (const candidate of COMMON_BROWSER_PATHS) {
    if (await fileExists(candidate)) return candidate
  }
}

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

const browserLaunchArgs = () => {
  const args = ['--disable-dev-shm-usage']
  if (process.getuid?.() === 0) {
    args.push('--no-sandbox', '--disable-setuid-sandbox')
  }
  return args
}

const installBrowserEvaluateNameHelper = async (context: BrowserContext) => {
  // esbuild can wrap serialized Playwright page functions in __name(...).
  // Make that helper available inside GameDay pages after each navigation.
  await context.addInitScript('globalThis.__name = (target) => target')
}

const maybeDebug = async (
  page: Page,
  debugDir: string | undefined,
  label: string,
) => {
  if (!debugDir) return
  await fs.mkdir(debugDir, {recursive: true})
  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, '-')
  await fs.writeFile(
    path.join(debugDir, `${safeLabel}.html`),
    await page.content(),
    'utf8',
  )
  await page
    .screenshot({path: path.join(debugDir, `${safeLabel}.png`), fullPage: true})
    .catch(() => undefined)
}

const login = async (page: Page, options: TGamedayResolvedOptions) => {
  log('Opening GameDay...')
  await page.goto(options.startingUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })

  const emailInput = page.locator('input[name="email"]').first()
  if ((await emailInput.count()) === 0) return

  log('Logging in...')
  await emailInput.fill(options.username)
  await page.locator('input[name="password"]').first().fill(options.password)

  await page
    .waitForFunction(
      () => {
        const pageWindow = window as unknown as {
          grecaptcha?: {execute?: unknown}
        }
        return (
          pageWindow.grecaptcha &&
          typeof pageWindow.grecaptcha.execute === 'function'
        )
      },
      null,
      {timeout: 45_000},
    )
    .catch((error: Error) => {
      throw new Error(
        `Timed out waiting for GameDay reCAPTCHA to initialise. Try headed mode. ${error.message}`,
      )
    })

  await Promise.all([
    page
      .waitForURL((url) => !url.href.includes('/login/'), {timeout: 90_000})
      .catch(() => null),
    page.locator('input[type="submit"][value*="Login"], button[type="submit"]')
      .first()
      .click(),
  ])

  await page.waitForLoadState('domcontentloaded', {timeout: 60_000}).catch(() => null)
  await page.waitForTimeout(1_500)
  await maybeDebug(page, options.debugDir, 'after-login')

  if (page.url().includes('/login/')) {
    const bodyText = await page.locator('body').innerText().catch(() => '')
    if (/recaptcha|captcha/i.test(bodyText)) {
      throw new Error(
        'Login stayed on the login page after a reCAPTCHA error. Re-run in headed mode and avoid using headless mode.',
      )
    }
    throw new Error('Login stayed on the login page. Check the credentials.')
  }
}

const selectAssociation = async (
  page: Page,
  association: string,
  debugDir: string | undefined,
) => {
  log('Selecting organisation...')
  await page.goto('https://membership.mygameday.app/authlist.cgi', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await maybeDebug(page, debugDir, 'authlist')

  const associationPattern = new RegExp(escapeRegex(association), 'i')
  const associationLink = page
    .locator('a.org-list-entry, a.org-link-wrap, a')
    .filter({hasText: associationPattern})
    .first()
  if ((await associationLink.count()) === 0) {
    throw new Error(
      `Could not find organisation matching association "${association}" on the GameDay authorisation page.`,
    )
  }

  await Promise.all([
    page
      .waitForURL(
        (url) =>
          url.hostname === 'membership.mygameday.app' &&
          url.pathname.endsWith('/main.cgi'),
        {timeout: 90_000},
      )
      .catch(() => null),
    associationLink.click(),
  ])
  await page.waitForLoadState('domcontentloaded', {timeout: 60_000}).catch(() => null)
  await page.waitForTimeout(1_500)
  await maybeDebug(page, debugDir, 'association-home')
}

const selectCompetition = async (
  page: Page,
  competition: string,
  debugDir: string | undefined,
) => {
  log('Selecting competition...')
  const competitionListLink = page
    .locator('a#menu_listcompetitions, a[href*="a=CO_L"]')
    .first()
  if ((await competitionListLink.count()) === 0) {
    throw new Error('Could not find the GameDay List Competitions link.')
  }

  const href = await competitionListLink.getAttribute('href')
  if (!href) throw new Error('Could not read the GameDay List Competitions link.')
  await page.goto(resolveUrl(href, page.url()), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await setCompetitionListSeasonFilterToAll(page, debugDir)
  await maybeDebug(page, debugDir, 'competition-list')

  let competitionListItems = await readCompetitionListItems(page)
  let matchingCompetition = findCompetitionListItem(
    competitionListItems,
    competition,
  )

  if (!matchingCompetition) {
    const filtersApplied = await applyCompetitionListFilters(page)
    if (filtersApplied) {
      await waitForCompetitionListRefresh(page)
      await maybeDebug(page, debugDir, 'competition-list-filters-applied')
      competitionListItems = await readCompetitionListItems(page)
      matchingCompetition = findCompetitionListItem(
        competitionListItems,
        competition,
      )
    }
  }

  if (matchingCompetition) {
    const season = matchingCompetition.seasonName
      ? ` (${matchingCompetition.seasonName})`
      : ''
    log(`Matched GameDay competition "${matchingCompetition.title}"${season}.`)
    await page.goto(
      resolveUrl(decodeHtmlEntities(matchingCompetition.selectLink), page.url()),
      {waitUntil: 'domcontentloaded', timeout: 60_000},
    )
    await page.waitForLoadState('domcontentloaded', {timeout: 60_000}).catch(() => null)
    await page.waitForTimeout(1_500)
    await maybeDebug(page, debugDir, 'competition-home')
    return
  }

  const competitionPattern = new RegExp(escapeRegex(competition), 'i')
  const competitionLink = page.locator('a').filter({hasText: competitionPattern}).first()
  if ((await competitionLink.count()) === 0) {
    throw new Error(
      `Could not find competition matching "${competition}".${formatCompetitionListForError(
        competitionListItems,
      )}`,
    )
  }

  await Promise.all([
    page.waitForLoadState('domcontentloaded', {timeout: 60_000}).catch(() => null),
    competitionLink.click(),
  ])
  await page.waitForTimeout(1_500)
  await maybeDebug(page, debugDir, 'competition-home')
}

const setCompetitionListSeasonFilterToAll = async (
  page: Page,
  debugDir: string | undefined,
) => {
  const result: TGamedayCompetitionSeasonFilterResult = await page.evaluate(() => {
    const clean = (value: string | null | undefined) =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()

    const normalized = (value: string | null | undefined) =>
      clean(value).toLowerCase()

    const selectLabels = (select: HTMLSelectElement) => {
      const labels = Array.from(document.querySelectorAll('label'))
        .filter((label) => {
          if (select.id && label.htmlFor === select.id) return true
          return label.contains(select)
        })
        .map((label) => clean(label.textContent))

      return [
        ...labels,
        select.getAttribute('aria-label') || '',
        select.getAttribute('title') || '',
        select.name,
        select.id,
      ].filter((label) => label.length > 0)
    }

    const optionLabel = (option: HTMLOptionElement | undefined) => {
      if (!option) return ''
      return clean(option.textContent || option.label || option.value)
    }

    const allOptionScore = (option: HTMLOptionElement) => {
      if (option.disabled) return 0
      const text = normalized(option.textContent || option.label || option.value)
      const value = normalized(option.value)
      const looksLikeYear = /(?:19|20)\d{2}/.test(text)

      const looksLikeNoFilter = /\b(any|none|no filter)\b/.test(text)

      if (/\ball\s+seasons?\b/.test(text) || text === 'all seasons') return 7
      if (text === 'all') return 6
      if (['all', 'all_seasons', 'all-seasons'].includes(value)) return 5
      if (value === '-1' && !looksLikeYear) return 4
      if (value === '0' && (looksLikeNoFilter || text === '')) return 3
      if (value === '' && (looksLikeNoFilter || text === '')) return 2
      return 0
    }

    const findAllOption = (options: HTMLOptionElement[]) => {
      return options
        .map((option) => ({option, score: allOptionScore(option)}))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)[0]?.option
    }

    const selectScore = (select: HTMLSelectElement) => {
      const options = Array.from(select.options)
      const labels = selectLabels(select).map(normalized)
      const optionLabels = options.map((option) => normalized(option.textContent))
      const labelMentionsSeason = labels.some((label) => label.includes('season'))
      const optionMentionsSeason = optionLabels.some((label) =>
        label.includes('season'),
      )
      const yearOptionCount = optionLabels.filter((label) =>
        /(?:19|20)\d{2}/.test(label),
      ).length
      const hasAllOption = !!findAllOption(options)

      if (labelMentionsSeason) return 4
      if (optionMentionsSeason && hasAllOption) return 3
      if (yearOptionCount > 0 && hasAllOption) return 2
      return 0
    }

    const candidates = Array.from(document.querySelectorAll('select'))
      .map((select) => ({
        select,
        option: findAllOption(Array.from(select.options)),
        score: selectScore(select),
        label: selectLabels(select).join(' / ') || 'season filter',
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          select: HTMLSelectElement
          option: HTMLOptionElement
          score: number
          label: string
        } => candidate.score > 0 && !!candidate.option,
      )
      .sort((left, right) => right.score - left.score)

    const candidate = candidates[0]
    if (!candidate) {
      return {
        found: false,
        changed: false,
        label: '',
        previousLabel: '',
        selectedLabel: '',
      }
    }

    const previousOption = candidate.select.selectedOptions[0]
    const previousLabel = optionLabel(previousOption)
    const selectedLabel = optionLabel(candidate.option)
    const previousValue = candidate.select.value

    if (candidate.option.selected && previousValue === candidate.option.value) {
      return {
        found: true,
        changed: false,
        label: candidate.label,
        previousLabel,
        selectedLabel,
      }
    }

    candidate.option.selected = true
    candidate.select.value = candidate.option.value
    candidate.select.dispatchEvent(new Event('input', {bubbles: true}))
    candidate.select.dispatchEvent(new Event('change', {bubbles: true}))

    return {
      found: true,
      changed: previousValue !== candidate.select.value,
      label: candidate.label,
      previousLabel,
      selectedLabel,
    }
  })

  if (!result.found) {
    log('No GameDay competition season filter was found; using the current competition list.')
    return
  }

  if (!result.changed) {
    log(
      `GameDay competition season filter "${result.label}" is already "${result.selectedLabel}".`,
    )
    return
  }

  log(
    `Changed GameDay competition season filter "${result.label}" from "${result.previousLabel}" to "${result.selectedLabel}".`,
  )
  await waitForCompetitionListRefresh(page)
  await maybeDebug(page, debugDir, 'competition-list-all-seasons')
}

const applyCompetitionListFilters = async (page: Page) => {
  const applied: boolean = await page.evaluate(() => {
    const clean = (value: string | null | undefined) =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

    const selectLooksLikeSeasonFilter = (select: HTMLSelectElement) => {
      const optionLabels = Array.from(select.options).map((option) =>
        clean(option.textContent || option.label || option.value),
      )
      const labels = [
        select.name,
        select.id,
        select.getAttribute('aria-label') || '',
        select.getAttribute('title') || '',
        ...optionLabels,
      ].map(clean)
      const hasAllOption = optionLabels.some(
        (label) =>
          /\ball\s+seasons?\b/.test(label) ||
          label === 'all' ||
          label === 'all seasons',
      )
      const yearOptionCount = optionLabels.filter((label) =>
        /(?:19|20)\d{2}/.test(label),
      ).length
      return (
        labels.some((label) => label.includes('season')) ||
        (hasAllOption && yearOptionCount > 0)
      )
    }

    const seasonSelects = Array.from(document.querySelectorAll('select')).filter(
      selectLooksLikeSeasonFilter,
    )

    const seasonSelect = seasonSelects[0]
    const scope = seasonSelect?.form || document
    const controls = Array.from(
      scope.querySelectorAll('button, input[type="submit"], input[type="button"], a'),
    )

    const trigger = controls.find((control) => {
      const label =
        control instanceof HTMLInputElement
          ? clean(control.value)
          : clean(control.textContent)
      return /^(apply|filter|go|search|show|view|update)(\s|$)/.test(label)
    })

    if (trigger instanceof HTMLElement) {
      trigger.click()
      return true
    }

    if (seasonSelect?.form) {
      if (typeof seasonSelect.form.requestSubmit === 'function') {
        seasonSelect.form.requestSubmit()
      } else {
        seasonSelect.form.submit()
      }
      return true
    }

    return false
  })

  if (applied) log('Applied GameDay competition list filters.')
  return applied
}

const waitForCompetitionListRefresh = async (page: Page) => {
  await page.waitForLoadState('domcontentloaded', {timeout: 30_000}).catch(() => null)
  await page.waitForLoadState('networkidle', {timeout: 10_000}).catch(() => null)
  await page.waitForTimeout(1_500)
}

const readCompetitionListItems = async (page: Page) => {
  const pageContent = await page.content()
  return dedupeCompetitionListItems(readCompetitionGridDataItems(pageContent))
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readCompetitionGridDataItems = (pageContent: string) => {
  const rawGridData = readJavaScriptArrayAssignment(
    pageContent,
    /var\s+griddata\s*=\s*/,
  )
  if (!rawGridData) return []

  try {
    const parsed: unknown = JSON.parse(rawGridData)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): TGamedayCompetitionListItem[] => {
      if (!isRecord(item)) return []
      const competitionItem = competitionListItemFromRecord(item)
      return competitionItem ? [competitionItem] : []
    })
  } catch {
    return []
  }
}

const readJavaScriptArrayAssignment = (source: string, assignmentPattern: RegExp) => {
  const markerMatch = assignmentPattern.exec(source)
  if (!markerMatch) return ''

  const arrayStart = markerMatch.index + markerMatch[0].length
  if (source[arrayStart] !== '[') return ''

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
    } else if (character === '"') {
      inString = true
    } else if (character === '[') {
      depth += 1
    } else if (character === ']') {
      depth -= 1
      if (depth === 0) return source.slice(arrayStart, index + 1)
    }
  }

  return ''
}

const competitionListItemFromRecord = (
  record: Record<string, unknown>,
): TGamedayCompetitionListItem | undefined => {
  const title = readCompetitionRecordString(record, 'strTitle')
  const selectLink = readCompetitionRecordString(record, 'SelectLink')
  if (!title || !selectLink) return undefined
  return {
    title,
    selectLink,
    seasonName: readCompetitionRecordString(record, 'strSeasonName'),
    fixtureType: readCompetitionRecordString(record, 'intFixtureType'),
    teams: readCompetitionRecordString(record, 'teams'),
    abbreviation: readCompetitionRecordString(record, 'strAbbrev'),
    status: readCompetitionRecordString(record, 'intRecStatus'),
    id: readCompetitionRecordString(record, 'id'),
  }
}

const readCompetitionRecordString = (
  record: Record<string, unknown>,
  key: string,
) => {
  const value = record[key]
  if (typeof value === 'string') return decodeHtmlEntities(value).trim()
  if (typeof value === 'number') return String(value)
  return ''
}

const dedupeCompetitionListItems = (items: TGamedayCompetitionListItem[]) => {
  const dedupedItems: TGamedayCompetitionListItem[] = []
  const seenKeys = new Set<string>()
  for (const item of items) {
    const key = `${item.title}\u0000${item.selectLink}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    dedupedItems.push(item)
  }
  return dedupedItems
}

const findCompetitionListItem = (
  items: TGamedayCompetitionListItem[],
  competition: string,
) => {
  const competitionLabel = normalizeLabel(competition)
  const matchesExactly = (item: TGamedayCompetitionListItem) => {
    return [item.title, item.abbreviation]
      .filter(Boolean)
      .some((value) => normalizeLabel(value) === competitionLabel)
  }
  const matchesPartially = (item: TGamedayCompetitionListItem) => {
    return [item.title, item.abbreviation]
      .filter(Boolean)
      .some((value) => normalizeLabel(value).includes(competitionLabel))
  }
  return items.find(matchesExactly) ?? items.find(matchesPartially)
}

const formatCompetitionListForError = (items: TGamedayCompetitionListItem[]) => {
  if (items.length === 0) return ''
  const preview = items
    .slice(0, 20)
    .map((item) => {
      const season = item.seasonName ? ` (${item.seasonName})` : ''
      return `${item.title}${season}`
    })
    .join('; ')
  const suffix = items.length > 20 ? `; and ${items.length - 20} more` : ''
  return ` Available competitions: ${preview}${suffix}.`
}

const decodeHtmlEntities = (value: string) => {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const openAdvancedMemberReport = async (
  page: Page,
  reportId: string,
  debugDir: string | undefined,
) => {
  log('Opening Advanced Member report configuration...')
  const client = await currentClient(page)
  if (!client) {
    throw new Error('Could not find the GameDay client token after selection.')
  }

  const url = new URL('https://membership.mygameday.app/main.cgi')
  url.searchParams.set('client', client)
  url.searchParams.set('a', 'REP_CONFIG')
  url.searchParams.set('rID', reportId)

  await page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await page.waitForSelector('#reportform', {timeout: 60_000})
  await page.waitForFunction(
    () => document.querySelector('#ROselectedfields-list'),
    null,
    {timeout: 60_000},
  )
  await maybeDebug(page, debugDir, 'report-config')
}

const currentClient = async (page: Page) => {
  const fromUrl = new URL(page.url()).searchParams.get('client')
  if (fromUrl) return fromUrl
  return await page.locator('input[name="client"]').first().inputValue().catch(() => '')
}

const collectAvailableFields = async (page: Page) => {
  const fields: TGamedayAvailableField[] = await page.evaluate(() => {
    const clean = (value: string | null) =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
    return Array.from(document.querySelectorAll('.RO_fieldblock')).map((block) => {
      const id = block.id.replace(/^fld_/, '')
      const labelElement = block.querySelector('.RO_fieldname')
      const label = clean(labelElement ? labelElement.textContent : id)
      return {
        id,
        label,
        selected: Boolean(block.closest('#ROselectedfields-list')),
      }
    })
  })
  return fields
}

const resolveFields = (
  availableFields: TGamedayAvailableField[],
  options: TGamedayResolvedOptions,
): TGamedayResolvedField[] => {
  if (options.fields.length > 0) {
    const missing = options.fields.filter(
      (fieldId) => !availableFields.some((field) => field.id === fieldId),
    )
    if (missing.length > 0) {
      throw new Error(
        `Configured GameDay field id(s) were not found: ${missing.join(', ')}`,
      )
    }
    const headers =
      options.headers.length > 0
        ? options.headers
        : options.fields.map(
            (fieldId) =>
              availableFields.find((field) => field.id === fieldId)?.label ?? fieldId,
          )
    if (headers.length !== options.fields.length) {
      throw new Error('The configured GameDay header count must match the field count.')
    }
    return options.fields.map((id, index) => ({
      id,
      header: headers[index],
      sourceLabel: availableFields.find((field) => field.id === id)?.label ?? id,
    }))
  }

  const fieldDefs = DEFAULT_FIELD_DEFS.map((definition): TGamedayFieldDefinition => {
    if (definition.header !== 'Gender' || !options.genderField) return definition
    return {
      ...definition,
      preferredIds: [options.genderField, ...definition.preferredIds],
    }
  })

  const resolved = fieldDefs.map((definition) => {
    let match = definition.preferredIds
      .map((id) => availableFields.find((field) => field.id === id))
      .find((field): field is TGamedayAvailableField => !!field)
    if (!match) {
      match = availableFields.find((field) => definition.matches(field.label))
    }
    if (!match) {
      const genderCandidates =
        definition.header === 'Gender'
          ? ` Gender candidates: ${
              availableFields
                .filter((field) => /gender/i.test(field.label))
                .map((field) => `${field.id} (${field.label})`)
                .join(', ') || 'none'
            }.`
          : ''
      throw new Error(
        `Could not resolve GameDay field for "${definition.header}".${genderCandidates}`,
      )
    }
    return {id: match.id, header: definition.header, sourceLabel: match.label}
  })

  if (options.headers.length > 0) {
    if (options.headers.length !== resolved.length) {
      throw new Error('The configured GameDay header count must match the default field count.')
    }
    return resolved.map((field, index) => ({
      ...field,
      header: options.headers[index],
    }))
  }

  return resolved
}

const configureReport = async (
  page: Page,
  fields: TGamedayResolvedField[],
  recordFilter: string,
) => {
  log(
    `Selected report fields: ${fields
      .map((field) => `${field.header} <- ${field.sourceLabel}`)
      .join(', ')}`,
  )

  await page.evaluate(
    ({fieldIds, recordFilterValue}: {fieldIds: string[]; recordFilterValue: string}) => {
      const selectedList = document.getElementById('ROselectedfields-list')
      if (!selectedList) throw new Error('Selected fields list was not found.')

      for (const li of Array.from(selectedList.children)) {
        const block = li.querySelector('.RO_fieldblock')
        const fieldId = block ? block.id.replace(/^fld_/, '') : ''
        const removeLink = block
          ? block.querySelector('.RO_remove a[onclick*="removefield"]')
          : null
        const onclick = removeLink ? removeLink.getAttribute('onclick') ?? '' : ''
        const parentMatch = onclick.match(/removefield\('[^']+'\s*,\s*'([^']+)'\)/)
        const parentId = parentMatch?.[1]
        const parent = parentId ? document.getElementById(parentId) : null
        ;(parent || document.getElementById('hide_search') || selectedList).appendChild(li)
        const searchItem = fieldId ? document.getElementById(`s_${fieldId}`) : null
        if (searchItem) {
          searchItem.style.display = 'none'
          ;(document.getElementById('search_results') || document.body).appendChild(
            searchItem,
          )
        }
      }

      for (const fieldId of fieldIds) {
        const block = document.getElementById(`fld_${fieldId}`)
        if (!block) throw new Error(`Field block not found: ${fieldId}`)
        const li = block.closest('li')
        if (!li) throw new Error(`Field list item not found: ${fieldId}`)
        selectedList.appendChild(li)
        const checkbox = document.getElementById(`f_chk_${fieldId}`)
        if (checkbox instanceof HTMLInputElement) checkbox.checked = true
        const searchItem = document.getElementById(`s_${fieldId}`)
        if (searchItem) {
          searchItem.style.display = 'none'
          ;(document.getElementById('hide_search') || document.body).appendChild(
            searchItem,
          )
        }
      }

      const recordFilterInput = document.querySelector(
        `input[name="RO_RecordFilter"][value="${recordFilterValue}"]`,
      )
      if (recordFilterInput instanceof HTMLInputElement) {
        recordFilterInput.checked = true
      }

      const downloadOutput = document.querySelector(
        'input[name="RO_OutputType"][value="download"]',
      )
      if (!(downloadOutput instanceof HTMLInputElement)) {
        throw new Error('Download output option was not found.')
      }
      downloadOutput.checked = true

      const outputFormat = document.querySelector('select[name="RO_OutputFormat"]')
      if (outputFormat instanceof HTMLSelectElement) outputFormat.value = 'csv'

      const selectedFieldList = document.getElementById('ROselectedfieldlist')
      if (selectedFieldList instanceof HTMLInputElement) {
        selectedFieldList.value = fieldIds.join(',')
      }
    },
    {fieldIds: fields.map((field) => field.id), recordFilterValue: recordFilter},
  )
}

const buildReportRequest = async (
  page: Page,
  jobId: string,
): Promise<TGamedayReportRequest> => {
  const request = await page.evaluate((innerJobId: string) => {
    const form = document.getElementById('reportform')
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Report form was not found.')
    }

    const selectedIds = Array.from(
      document.querySelectorAll('#ROselectedfields .RO_fieldblock'),
    ).map((block) => block.id.replace(/^fld_/, ''))
    const selectedFieldList = document.getElementById('ROselectedfieldlist')
    if (selectedFieldList instanceof HTMLInputElement) {
      selectedFieldList.value = selectedIds.join(',')
    }

    const params = new URLSearchParams()
    for (const [key, value] of new FormData(form).entries()) {
      params.append(key, String(value))
    }
    params.append('ajax', '1')
    params.append('jobID', innerJobId)

    return {
      action: form.action,
      body: params.toString(),
      client: params.get('client') || '',
      selectedIds,
    }
  }, jobId)

  return {...request, jobId}
}

const runReportAndDownload = async (
  requestContext: APIRequestContext,
  request: TGamedayReportRequest,
  timeoutMs: number,
) => {
  log('Starting GameDay report job...')
  const postPromise = requestContext
    .post(request.action, {
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      data: request.body,
      timeout: timeoutMs,
    })
    .then(() => null)
    .catch((error: unknown) => ({error: errorMessage(error)}))

  const startedAt = Date.now()
  let lastStatus = ''
  await sleep(5_000)

  while (Date.now() - startedAt < timeoutMs) {
    const statusResponse = await requestContext.get(request.action, {
      params: {
        a: 'REP_STATUS',
        jobID: request.jobId,
        client: request.client,
        ajax: '1',
        format: 'download',
      },
      timeout: 30_000,
    })
    const statusText = await statusResponse.text()
    const status = parseReportStatus(statusText, statusResponse.status())

    if (status.status && status.status !== lastStatus) {
      log(`Report status: ${status.status}`)
      lastStatus = status.status
    }

    if (status.status === 'Complete') {
      const postResult = await Promise.race([
        postPromise,
        sleep(1_000).then(() => null),
      ])
      if (postResult?.error) {
        throw new Error(`The GameDay report request failed: ${postResult.error}`)
      }
      return await downloadCompletedReport(requestContext, request, timeoutMs)
    }

    if (status.status === 'Failed') {
      throw new Error('GameDay reported that the export job failed.')
    }

    await sleep(1_000)
  }

  throw new Error(
    `Timed out waiting for GameDay report after ${Math.round(timeoutMs / 1000)} seconds.`,
  )
}

const parseReportStatus = (statusText: string, statusCode: number) => {
  try {
    const parsed: unknown = JSON.parse(statusText)
    if (typeof parsed === 'object' && parsed !== null && 'status' in parsed) {
      const status = (parsed as {status?: unknown}).status
      return {status: typeof status === 'string' ? status : undefined}
    }
    return {status: undefined}
  } catch {
    throw new Error(
      `GameDay returned a non-JSON report status response (${statusCode}): ${statusText.slice(0, 250)}`,
    )
  }
}

const downloadCompletedReport = async (
  requestContext: APIRequestContext,
  request: TGamedayReportRequest,
  timeoutMs: number,
) => {
  log('Downloading completed CSV...')
  const response = await requestContext.get(request.action, {
    params: {
      a: 'REP_STATUS',
      jobID: request.jobId,
      client: request.client,
      ajax: '1',
      format: 'downloading',
    },
    timeout: timeoutMs,
  })

  if (!response.ok()) {
    throw new Error(
      `CSV download failed with HTTP ${response.status()}: ${(await response.text()).slice(0, 250)}`,
    )
  }

  const body = await response.body()
  const contentType = response.headers()['content-type'] || ''
  const preview = body.subarray(0, 100).toString('utf8')
  if (/text\/html/i.test(contentType) && /^\s*</.test(preview)) {
    throw new Error(`CSV download looked like HTML instead of CSV: ${preview.slice(0, 100)}`)
  }

  return body
}

const parseMemberRows = (csvBuffer: Buffer): TGamedayExportMember[] => {
  const nonEmptyRows = parseCSVRows(csvBuffer.toString('utf8')).filter((row) =>
    row.some((token) => token.trim().length > 0),
  )
  const rows = removeTrailingGamedaySummaryRow(nonEmptyRows)
  const [rawHeaders, ...body] = rows
  if (!rawHeaders) return []

  const headers = rawHeaders.map(normalizeHeader)
  const columnIndexes = resolveMemberColumnIndexes(headers)

  return body
    .map((row) => ({
      teamName: (row[columnIndexes.team] ?? '').trim(),
      firstName: (row[columnIndexes.first] ?? '').trim(),
      lastName: (row[columnIndexes.last] ?? '').trim(),
      email: (row[columnIndexes.email] ?? '').trim(),
      gender: (row[columnIndexes.gender] ?? '').trim(),
    }))
    .filter((member) => Object.values(member).some((value) => value.length > 0))
}

const removeTrailingGamedaySummaryRow = (rows: string[][]): string[][] => {
  const lastRow = rows.at(-1)
  if (!lastRow || !isGamedaySummaryRow(lastRow)) return rows
  return rows.slice(0, -1)
}

const isGamedaySummaryRow = (row: string[]): boolean => {
  const populatedTokens = row.map((token) => token.trim()).filter(Boolean)
  return (
    populatedTokens.length === 1 &&
    GAMEDAY_SUMMARY_ROW_PATTERN.test(populatedTokens[0] ?? '')
  )
}

const resolveMemberColumnIndexes = (headers: string[]) => {
  try {
    return {
      team: resolveRequiredColumn(headers, ['teamname', 'team']),
      first: resolveRequiredColumn(headers, ['firstname', 'givenname']),
      last: resolveRequiredColumn(headers, [
        'familyname',
        'lastname',
        'surname',
      ]),
      email: resolveRequiredColumn(headers, ['email', 'emailaddress']),
      gender: resolveRequiredColumn(headers, ['gender']),
    }
  } catch (error) {
    if (headers.length >= 5) {
      return {team: 0, first: 1, last: 2, email: 3, gender: 4}
    }
    throw error
  }
}

const resolveRequiredColumn = (headers: string[], candidates: string[]) => {
  const index = headers.findIndex((header) => candidates.includes(header))
  if (index === -1) {
    throw new Error(
      `GameDay export was missing a required column (${candidates.join('/')}).`,
    )
  }
  return index
}

const errorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
