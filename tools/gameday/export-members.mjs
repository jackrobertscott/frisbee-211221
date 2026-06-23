import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const invocationCwd = process.env.INIT_CWD || process.cwd();

const DEFAULT_FIELD_DEFS = [
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
    preferredIds: ['intGender', 'intGenderID', 'strGender', 'Gender'],
    matches: (label) => {
      const normalized = normalizeLabel(label);
      return normalized === 'gender' || (normalized.includes('gender') && !normalized.includes('parent') && !normalized.includes('guardian'));
    },
  },
];


function resolveCliPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(invocationCwd, value);
}

function usage() {
  return `Usage: npm run export -- [options]\n\nOptions:\n  --env <path>            Env file to load (default: ../../.env.gameday)\n  --output <path>         CSV output path (default: output/gameday-members-<timestamp>.csv)\n  --association <name>    Organisation/association name override\n  --competition <name>    Optional competition name to open before exporting\n  --fields <ids>          Comma-separated GameDay field ids override\n  --headers <names>       Comma-separated output CSV headers override\n  --headless              Run browser headless (may fail GameDay reCAPTCHA)\n  --headed                Run browser headed (default)\n  --debug                 Save debug screenshots/html under output/debug\n  --help                  Show this help\n`;
}

function parseArgs(argv) {
  const out = { debug: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case '--env':
        out.envPath = readValue();
        break;
      case '--output':
        out.outputPath = readValue();
        break;
      case '--association':
        out.association = readValue();
        break;
      case '--competition':
        out.competition = readValue();
        break;
      case '--fields':
        out.fields = splitCsvLike(readValue());
        break;
      case '--headers':
        out.headers = splitCsvLike(readValue());
        break;
      case '--headless':
        out.headless = true;
        break;
      case '--headed':
        out.headless = false;
        break;
      case '--debug':
        out.debug = true;
        break;
      case '--help':
      case '-h':
        out.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return out;
}

function splitCsvLike(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

async function loadEnvFile(filePath) {
  const env = {};
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return env;
    throw error;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function requiredEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment value: ${key}`);
  return value;
}

function timestamp() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveUrl(href, baseUrl) {
  return new URL(href, baseUrl).href;
}

async function launchBrowser({ headless, browserChannel }) {
  const launchOptions = { headless };
  if (browserChannel && browserChannel !== 'bundled') {
    launchOptions.channel = browserChannel;
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    if (launchOptions.channel) {
      console.warn(`Could not launch browser channel "${launchOptions.channel}"; trying bundled Chromium.`);
      return await chromium.launch({ headless });
    }
    throw error;
  }
}

async function maybeDebug(page, debugDir, label) {
  if (!debugDir) return;
  await fs.mkdir(debugDir, { recursive: true });
  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, '-');
  await fs.writeFile(path.join(debugDir, `${safeLabel}.html`), await page.content(), 'utf8');
  await page.screenshot({ path: path.join(debugDir, `${safeLabel}.png`), fullPage: true }).catch(() => {});
}

async function login(page, env, debugDir) {
  console.log('Opening GameDay...');
  await page.goto(requiredEnv(env, 'STARTING_URL'), { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const emailInput = page.locator('input[name="email"]').first();
  if ((await emailInput.count()) === 0) {
    return;
  }

  console.log('Logging in...');
  await emailInput.fill(requiredEnv(env, 'USERNAME'));
  await page.locator('input[name="password"]').first().fill(requiredEnv(env, 'PASSWORD'));

  await page
    .waitForFunction(() => window.grecaptcha && typeof window.grecaptcha.execute === 'function', null, { timeout: 45_000 })
    .catch((error) => {
      throw new Error(`Timed out waiting for GameDay reCAPTCHA to initialise. Try headed mode. ${error.message}`);
    });

  await Promise.all([
    page.waitForURL((url) => !url.href.includes('/login/'), { timeout: 90_000 }).catch(() => null),
    page.locator('input[type="submit"][value*="Login"], button[type="submit"]').first().click(),
  ]);

  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1_500);
  await maybeDebug(page, debugDir, 'after-login');

  if (page.url().includes('/login/')) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/recaptcha|captcha/i.test(bodyText)) {
      throw new Error('Login stayed on the login page after a reCAPTCHA error. Re-run in headed mode and avoid using --headless.');
    }
    throw new Error('Login stayed on the login page. Check the credentials in the env file.');
  }
}

async function selectAssociation(page, association, debugDir) {
  console.log('Selecting organisation...');
  await page.goto('https://membership.mygameday.app/authlist.cgi', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await maybeDebug(page, debugDir, 'authlist');

  const associationPattern = new RegExp(escapeRegex(association), 'i');
  const associationLink = page.locator('a.org-list-entry, a.org-link-wrap, a').filter({ hasText: associationPattern }).first();
  if ((await associationLink.count()) === 0) {
    throw new Error(`Could not find organisation matching ASSOCIATION="${association}" on the GameDay authorisation page.`);
  }

  await Promise.all([
    page.waitForURL((url) => url.hostname === 'membership.mygameday.app' && url.pathname.endsWith('/main.cgi'), { timeout: 90_000 }).catch(() => null),
    associationLink.click(),
  ]);
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1_500);
  await maybeDebug(page, debugDir, 'association-home');
}

async function maybeSelectCompetition(page, competition, debugDir) {
  if (!competition) return;

  console.log('Selecting competition...');
  const competitionListLink = page.locator('a#menu_listcompetitions, a[href*="a=CO_L"]').first();
  if ((await competitionListLink.count()) === 0) {
    throw new Error('Could not find the GameDay List Competitions link.');
  }

  const href = await competitionListLink.getAttribute('href');
  await page.goto(resolveUrl(href, page.url()), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await maybeDebug(page, debugDir, 'competition-list');

  const competitionPattern = new RegExp(escapeRegex(competition), 'i');
  const competitionLink = page.locator('a').filter({ hasText: competitionPattern }).first();
  if ((await competitionLink.count()) === 0) {
    throw new Error(`Could not find competition matching COMPETITION="${competition}".`);
  }

  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => null),
    competitionLink.click(),
  ]);
  await page.waitForTimeout(1_500);
  await maybeDebug(page, debugDir, 'competition-home');
}

async function openAdvancedMemberReport(page, reportId, debugDir) {
  console.log('Opening Advanced Member report configuration...');
  const client = await currentClient(page);
  if (!client) throw new Error('Could not find the GameDay client token after selecting the organisation.');

  const url = new URL('https://membership.mygameday.app/main.cgi');
  url.searchParams.set('client', client);
  url.searchParams.set('a', 'REP_CONFIG');
  url.searchParams.set('rID', reportId);

  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#reportform', { timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('#ROselectedfields-list'), null, { timeout: 60_000 });
  await maybeDebug(page, debugDir, 'report-config');
}

async function currentClient(page) {
  const fromUrl = new URL(page.url()).searchParams.get('client');
  if (fromUrl) return fromUrl;
  return await page.locator('input[name="client"]').first().inputValue().catch(() => '');
}

async function collectAvailableFields(page) {
  return await page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('.RO_fieldblock')).map((block) => {
      const id = block.id.replace(/^fld_/, '');
      const labelElement = block.querySelector('.RO_fieldname');
      const label = clean(labelElement ? labelElement.textContent : id);
      return { id, label, selected: Boolean(block.closest('#ROselectedfields-list')) };
    });
  });
}

function resolveFields(availableFields, env, options) {
  const fieldsFromEnv = options.fields?.length ? options.fields : splitCsvLike(env.GAMEDAY_FIELDS || env.FIELD_IDS || '');
  const headersFromEnv = options.headers?.length ? options.headers : splitCsvLike(env.GAMEDAY_HEADERS || env.OUTPUT_HEADERS || '');

  if (fieldsFromEnv.length > 0) {
    const missing = fieldsFromEnv.filter((fieldId) => !availableFields.some((field) => field.id === fieldId));
    if (missing.length > 0) {
      throw new Error(`Configured GameDay field id(s) were not found: ${missing.join(', ')}`);
    }
    const headers = headersFromEnv.length > 0 ? headersFromEnv : fieldsFromEnv.map((fieldId) => availableFields.find((field) => field.id === fieldId)?.label || fieldId);
    if (headers.length !== fieldsFromEnv.length) {
      throw new Error('The --headers/GAMEDAY_HEADERS count must match the --fields/GAMEDAY_FIELDS count.');
    }
    return fieldsFromEnv.map((id, index) => ({ id, header: headers[index], sourceLabel: availableFields.find((field) => field.id === id)?.label || id }));
  }

  const genderOverride = env.GAMEDAY_GENDER_FIELD || env.GENDER_FIELD_ID;
  const fieldDefs = DEFAULT_FIELD_DEFS.map((definition) => {
    if (definition.header !== 'Gender' || !genderOverride) return definition;
    return { ...definition, preferredIds: [genderOverride, ...definition.preferredIds] };
  });

  const resolved = fieldDefs.map((definition) => {
    let match = definition.preferredIds.map((id) => availableFields.find((field) => field.id === id)).find(Boolean);
    if (!match) {
      match = availableFields.find((field) => definition.matches(field.label));
    }
    if (!match) {
      const genderCandidates = definition.header === 'Gender'
        ? ` Gender candidates: ${availableFields.filter((field) => /gender/i.test(field.label)).map((field) => `${field.id} (${field.label})`).join(', ') || 'none'}.`
        : '';
      throw new Error(`Could not resolve GameDay field for "${definition.header}".${genderCandidates}`);
    }
    return { id: match.id, header: definition.header, sourceLabel: match.label };
  });

  if (headersFromEnv.length > 0) {
    if (headersFromEnv.length !== resolved.length) {
      throw new Error('The --headers/GAMEDAY_HEADERS count must match the default field count.');
    }
    return resolved.map((field, index) => ({ ...field, header: headersFromEnv[index] }));
  }

  return resolved;
}

async function configureReport(page, fields, env) {
  console.log(`Selected report fields: ${fields.map((field) => `${field.header} <- ${field.sourceLabel}`).join(', ')}`);
  const recordFilter = env.GAMEDAY_RECORD_FILTER || env.RECORD_FILTER || 'DISTINCT';

  await page.evaluate(({ fieldIds, recordFilterValue }) => {
    const selectedList = document.getElementById('ROselectedfields-list');
    if (!selectedList) throw new Error('Selected fields list was not found.');

    for (const li of Array.from(selectedList.children)) {
      const block = li.querySelector('.RO_fieldblock');
      const fieldId = block ? block.id.replace(/^fld_/, '') : '';
      const removeLink = block ? block.querySelector('.RO_remove a[onclick*="removefield"]') : null;
      const onclick = removeLink ? removeLink.getAttribute('onclick') || '' : '';
      const parentMatch = onclick.match(/removefield\('[^']+'\s*,\s*'([^']+)'\)/);
      const parent = parentMatch ? document.getElementById(parentMatch[1]) : null;
      (parent || document.getElementById('hide_search') || selectedList).appendChild(li);
      const searchItem = fieldId ? document.getElementById(`s_${fieldId}`) : null;
      if (searchItem) {
        searchItem.style.display = 'none';
        (document.getElementById('search_results') || document.body).appendChild(searchItem);
      }
    }

    for (const fieldId of fieldIds) {
      const block = document.getElementById(`fld_${fieldId}`);
      if (!block) throw new Error(`Field block not found: ${fieldId}`);
      const li = block.closest('li');
      if (!li) throw new Error(`Field list item not found: ${fieldId}`);
      selectedList.appendChild(li);
      const checkbox = document.getElementById(`f_chk_${fieldId}`);
      if (checkbox) checkbox.checked = true;
      const searchItem = document.getElementById(`s_${fieldId}`);
      if (searchItem) {
        searchItem.style.display = 'none';
        (document.getElementById('hide_search') || document.body).appendChild(searchItem);
      }
    }

    const recordFilterInput = document.querySelector(`input[name="RO_RecordFilter"][value="${recordFilterValue}"]`);
    if (recordFilterInput) recordFilterInput.checked = true;

    const downloadOutput = document.querySelector('input[name="RO_OutputType"][value="download"]');
    if (!downloadOutput) throw new Error('Download output option was not found.');
    downloadOutput.checked = true;

    const outputFormat = document.querySelector('select[name="RO_OutputFormat"]');
    if (outputFormat) outputFormat.value = 'csv';

    const selectedFieldList = document.getElementById('ROselectedfieldlist');
    if (selectedFieldList) selectedFieldList.value = fieldIds.join(',');
  }, { fieldIds: fields.map((field) => field.id), recordFilterValue: recordFilter });
}

async function buildReportRequest(page, jobId) {
  return await page.evaluate((innerJobId) => {
    const form = document.getElementById('reportform');
    if (!form) throw new Error('Report form was not found.');

    const selectedIds = Array.from(document.querySelectorAll('#ROselectedfields .RO_fieldblock')).map((block) => block.id.replace(/^fld_/, ''));
    const selectedFieldList = document.getElementById('ROselectedfieldlist');
    if (selectedFieldList) selectedFieldList.value = selectedIds.join(',');

    const params = new URLSearchParams(new FormData(form));
    params.append('ajax', '1');
    params.append('jobID', innerJobId);

    return {
      action: form.action,
      body: params.toString(),
      client: params.get('client') || '',
      selectedIds,
    };
  }, jobId);
}

async function runReportAndDownload(context, request, timeoutMs) {
  console.log('Starting GameDay report job...');
  const postPromise = context.request.post(request.action, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: request.body,
    timeout: timeoutMs,
  }).catch((error) => ({ error }));

  const startedAt = Date.now();
  let lastStatus = '';
  await sleep(5_000);

  while (Date.now() - startedAt < timeoutMs) {
    const statusResponse = await context.request.get(request.action, {
      params: {
        a: 'REP_STATUS',
        jobID: request.jobId,
        client: request.client,
        ajax: '1',
        format: 'download',
      },
      timeout: 30_000,
    });
    const statusText = await statusResponse.text();
    let status;
    try {
      status = JSON.parse(statusText);
    } catch (error) {
      throw new Error(`GameDay returned a non-JSON report status response (${statusResponse.status()}): ${statusText.slice(0, 250)}`);
    }

    if (status.status && status.status !== lastStatus) {
      console.log(`Report status: ${status.status}`);
      lastStatus = status.status;
    }

    if (status.status === 'Complete') {
      const postResult = await Promise.race([postPromise, sleep(1_000).then(() => null)]);
      if (postResult && postResult.error) {
        throw new Error(`The GameDay report request failed: ${postResult.error.message}`);
      }
      return await downloadCompletedReport(context, request, timeoutMs);
    }

    if (status.status === 'Failed') {
      throw new Error('GameDay reported that the export job failed.');
    }

    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for GameDay report after ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function downloadCompletedReport(context, request, timeoutMs) {
  console.log('Downloading completed CSV...');
  const response = await context.request.get(request.action, {
    params: {
      a: 'REP_STATUS',
      jobID: request.jobId,
      client: request.client,
      ajax: '1',
      format: 'downloading',
    },
    timeout: timeoutMs,
  });

  if (!response.ok()) {
    throw new Error(`CSV download failed with HTTP ${response.status()}: ${(await response.text()).slice(0, 250)}`);
  }

  const body = await response.body();
  const contentType = response.headers()['content-type'] || '';
  const preview = body.subarray(0, 100).toString('utf8');
  if (/text\/html/i.test(contentType) && /^\s*</.test(preview)) {
    throw new Error(`CSV download looked like HTML instead of CSV: ${preview.slice(0, 100)}`);
  }

  return body;
}

function replaceCsvHeader(csvBuffer, headers) {
  const text = csvBuffer.toString('utf8');
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? text.slice(1) : text;
  const firstRecordEnd = findFirstCsvRecordEnd(body);
  const newHeader = headers.map(csvEscape).join(',');
  return Buffer.from(`${bom}${newHeader}${body.slice(firstRecordEnd)}`, 'utf8');
}

function findFirstCsvRecordEnd(text) {
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === '\n') return index;
  }
  return text.length;
}

function csvEscape(value) {
  const stringValue = String(value ?? '');
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function countCsvRecords(csvBuffer) {
  const text = csvBuffer.toString('utf8');
  if (!text.trim()) return 0;
  let records = 1;
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === '\n' && index < text.length - 1) records += 1;
  }
  return records;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const envPath = options.envPath ? resolveCliPath(options.envPath) : path.join(repoRoot, '.env.gameday');
  const fileEnv = await loadEnvFile(envPath);
  const env = { ...fileEnv, ...process.env };

  if (options.association) env.ASSOCIATION = options.association;
  if (options.competition) env.COMPETITION = options.competition;
  if (options.fields?.length) env.GAMEDAY_FIELDS = options.fields.join(',');
  if (options.headers?.length) env.GAMEDAY_HEADERS = options.headers.join(',');

  requiredEnv(env, 'STARTING_URL');
  requiredEnv(env, 'USERNAME');
  requiredEnv(env, 'PASSWORD');
  requiredEnv(env, 'ASSOCIATION');

  const outputPath = options.outputPath ? resolveCliPath(options.outputPath) : path.join(scriptDir, 'output', `gameday-members-${timestamp()}.csv`);
  const debugDir = options.debug || parseBool(env.DEBUG, false) ? path.join(path.dirname(outputPath), 'debug') : '';
  const headless = options.headless ?? parseBool(env.HEADLESS ?? env.GAMEDAY_HEADLESS, false);
  const browserChannel = env.BROWSER_CHANNEL || env.PLAYWRIGHT_CHANNEL || 'chrome';
  const reportId = env.GAMEDAY_REPORT_ID || env.REPORT_ID || '3';
  const timeoutMs = Number(env.REPORT_TIMEOUT_MS || env.GAMEDAY_TIMEOUT_MS || 300_000);
  const normalizeHeaders = parseBool(env.NORMALIZE_HEADERS ?? env.GAMEDAY_NORMALIZE_HEADERS, true);

  let browser;
  try {
    browser = await launchBrowser({ headless, browserChannel });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    await login(page, env, debugDir);
    await selectAssociation(page, env.ASSOCIATION, debugDir);
    await maybeSelectCompetition(page, env.COMPETITION, debugDir);
    await openAdvancedMemberReport(page, reportId, debugDir);

    const availableFields = await collectAvailableFields(page);
    const fields = resolveFields(availableFields, env, options);
    await configureReport(page, fields, env);

    const jobId = crypto.randomUUID();
    const request = await buildReportRequest(page, jobId);
    request.jobId = jobId;

    let csvBuffer = await runReportAndDownload(context, request, timeoutMs);
    if (normalizeHeaders) {
      csvBuffer = replaceCsvHeader(csvBuffer, fields.map((field) => field.header));
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, csvBuffer);

    const records = countCsvRecords(csvBuffer);
    const dataRows = Math.max(0, records - 1);
    console.log(`Wrote ${dataRows} data row(s) to ${outputPath}`);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((error) => {
  console.error(`Export failed: ${error.message}`);
  process.exitCode = 1;
});
