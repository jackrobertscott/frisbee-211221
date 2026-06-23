# GameDay member CSV export

Automates the GameDay **Reports → Members → Advanced Member** export described in `gameday-export.pdf`.

## Setup

```sh
cd tools/gameday-export
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

The script defaults to the repository root `.env.gameday` file and uses installed Google Chrome (`BROWSER_CHANNEL=chrome`). If Chrome is not available, install Playwright's browser with `npx playwright install chromium` and run with `BROWSER_CHANNEL=bundled`.

## Run

From this folder:

```sh
npm run export
```

Or from the repository root:

```sh
npm --prefix tools/gameday-export run export
```

The CSV is written to `tools/gameday-export/output/gameday-members-<timestamp>.csv`.

## Environment

Required in `.env.gameday` or the shell:

- `STARTING_URL`
- `USERNAME`
- `PASSWORD`
- `ASSOCIATION`

Optional:

- `COMPETITION` - open a specific competition before exporting.
- `GAMEDAY_FIELDS` - comma-separated field ids if the default field detection needs overriding.
- `GAMEDAY_HEADERS` - comma-separated output headers. Defaults to `Team Name,First Name,Family Name,Email,Gender`.
- `GAMEDAY_GENDER_FIELD` - explicit GameDay field id for the gender column.
- `HEADLESS=1` - run headless. Headed mode is the default because GameDay reCAPTCHA can fail in headless browsers.
- `BROWSER_CHANNEL=chrome` - Playwright browser channel to use.
- `REPORT_TIMEOUT_MS=300000` - export timeout.

Useful CLI overrides:

```sh
npm run export -- --output ./output/latest.csv --debug
npm run export -- --association "Organisation Name" --competition "Competition Name"
```
