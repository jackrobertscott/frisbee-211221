import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {
  createElement as $,
  ChangeEvent,
  FC,
  Fragment,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  TGamedayImportConfigSafe,
  TGamedayImportRun,
} from '@shared/schemas/ioGamedayImport'
import {TSeason} from '@shared/schemas/ioSeason'
import {
  $PortExport,
  $PortGamedayImport,
  $PortGamedayImportLoad,
  $PortGamedayImportSave,
  $PortImport,
} from '../../endpoints/Port'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {download} from '../../utils/download'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormHelp} from '../Form/FormHelp'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputDate} from '../Input/InputDate'
import {InputSelect} from '../Input/InputSelect'
import {InputString} from '../Input/InputString'
import {MockDeleteConfirmation} from '../MockDeleteConfirmation'
import {MockGenerate} from '../MockGenerate'
import {Modal} from '../Modal'
import {Poster} from '../Poster'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'

interface TGamedayImportState {
  config?: TGamedayImportConfigSafe
  runs: TGamedayImportRun[]
}

export const DashboardPort: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const [importing, importingSet] = useState(false)
  const [exporting, exportingSet] = useState(false)
  const [gamedayConfigOpen, gamedayConfigOpenSet] = useState(false)
  const [gamedayRunOpen, gamedayRunOpenSet] = useState(false)
  const [generating, generatingSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const [gamedayState, gamedayStateSet] = useState<TGamedayImportState>()
  const $export = useEndpoint($PortExport)
  const $gamedayLoad = useEndpoint($PortGamedayImportLoad)
  const seasonId = auth.season?.id
  const gamedayReload = async () => {
    if (!seasonId) return
    const state = await $gamedayLoad.fetch({seasonId})
    gamedayStateSet(state)
  }

  useEffect(() => {
    gamedayStateSet(undefined)
    if (seasonId) void gamedayReload()
  }, [seasonId])

  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin,
        children: addkeys([
          $('div', {
            className: css({
              display: 'flex',
              flexWrap: 'wrap',
              gap: theme.fib[5],
              [theme.ltMedia(theme.fib[14])]: {
                flexDirection: 'column',
              },
              '& > *': {
                flexShrink: 0,
                [theme.gtMedia(theme.fib[14])]: {
                  flexBasis: 0,
                },
              },
            }),
            children: addkeys([
              $(FormBadge, {
                grow: true,
                icon: 'download',
                label: 'Import CSV',
                background: theme.bgAdminButton,
                click: () => importingSet(true),
              }),
              $(FormBadge, {
                grow: true,
                icon: 'cog',
                label: 'GameDay Settings',
                background: theme.bgAdminButton,
                disabled: !auth.season,
                click: () => gamedayConfigOpenSet(true),
              }),
              $(FormBadge, {
                grow: true,
                icon: 'cloud-download-alt',
                label: 'Run GameDay Import',
                background: theme.bgAdminButton,
                disabled: !auth.season || !gamedayState?.config,
                click: () => gamedayRunOpenSet(true),
              }),
              $(FormBadge, {
                grow: true,
                icon: 'upload',
                label: 'Export Data',
                background: theme.bgAdminButton,
                click: () => exportingSet(true),
              }),
              $(FormBadge, {
                grow: true,
                icon: 'magic',
                label: 'Create Mock Data',
                background: theme.bgAdminButton,
                click: () => generatingSet(true),
              }),
              $(FormBadge, {
                grow: true,
                icon: 'trash',
                label: 'Delete Mock Data',
                background: theme.bgAdminButton,
                click: () => deletingSet(true),
              }),
            ]),
          }),
          auth.season &&
            $(DashboardGamedayImportRunsSection, {
              runs: gamedayState?.runs,
            }),
        ]),
      }),
      $(Fragment, {
        children:
          importing &&
          $(_DashboardImport, {
            season: auth.season!,
            done: () => {
              toaster.notify('Import finished.')
              importingSet(false)
            },
            close: () => importingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          exporting &&
          $(_DashboardExport, {
            close: () => exportingSet(false),
            done: () => exportingSet(false),
            exportEndpoint: $export,
            toasterNotify: toaster.notify,
          }),
      }),
      $(Fragment, {
        children:
          auth.season &&
          gamedayConfigOpen &&
          $(_DashboardGamedayImportConfig, {
            season: auth.season,
            state: gamedayState,
            reload: gamedayReload,
            close: () => gamedayConfigOpenSet(false),
          }),
      }),
      $(Fragment, {
        children:
          auth.season &&
          gamedayRunOpen &&
          $(_DashboardGamedayImportRunConfirmation, {
            season: auth.season,
            config: gamedayState?.config,
            reload: gamedayReload,
            close: () => gamedayRunOpenSet(false),
            done: () => gamedayRunOpenSet(false),
          }),
      }),
      $(Fragment, {
        children:
          auth.season &&
          generating &&
          $(MockGenerate, {
            seasonId: auth.season.id,
            close: () => generatingSet(false),
            done: () => generatingSet(false),
          }),
      }),
      $(Fragment, {
        children:
          deleting &&
          $(MockDeleteConfirmation, {
            close: () => deletingSet(false),
            done: () => deletingSet(false),
          }),
      }),
    ]),
  })
}

const DashboardGamedayImportRunsSection: FC<{
  runs?: TGamedayImportRun[]
}> = ({runs}) => {
  return $(FormColumn, {
    grow: true,
    children: addkeys([
      $(FormBadge, {
        label: 'GameDay Import History',
        background: theme.bgMinor,
      }),
      $(GamedayImportRunsTable, {runs}),
    ]),
  })
}

const GamedayImportRunsTable: FC<{
  runs?: TGamedayImportRun[]
}> = ({runs}) => {
  if (!runs) return $(Spinner)
  return $(Table, {
    grow: true,
    head: {
      started: {label: 'Started', grow: 2},
      trigger: {label: 'Trigger', grow: 1},
      status: {label: 'Status', grow: 1},
      source: {label: 'Source', grow: 3},
      rows: {label: 'Rows', grow: 1},
      members: {label: 'Members', grow: 1},
      error: {label: 'Error', grow: 3},
    },
    body: runs.map((run) => ({
      key: run.id,
      data: {
        started: {value: formatGamedayRunDate(run.startedOn)},
        trigger: {value: formatGamedayRunTrigger(run.trigger)},
        status: {value: formatGamedayRunStatus(run.status)},
        source: {value: `${run.association} / ${run.competition}`},
        rows: {value: formatGamedayRunNumber(run.rowsImported)},
        members: {value: formatGamedayRunNumber(run.membersCreated)},
        error: {value: run.errorMessage || '—'},
      },
    })),
  })
}

const formatGamedayRunDate = (value: string) => {
  return dayjs(value).format('D MMM YYYY HH:mm')
}

const formatGamedayRunTrigger = (value: TGamedayImportRun['trigger']) => {
  return value === 'scheduled' ? 'Scheduled' : 'Manual'
}

const formatGamedayRunStatus = (value: TGamedayImportRun['status']) => {
  if (value === 'succeeded') return 'Succeeded'
  if (value === 'failed') return 'Failed'
  return 'Running'
}

const formatGamedayRunNumber = (value: number | undefined) => {
  return value === undefined ? '—' : value
}

export const _DashboardExport: FC<{
  close: () => void
  done: () => void
  exportEndpoint: {
    loading: boolean
    fetch: (payload: {fileType: 'csv' | 'json'}) => Promise<unknown>
  }
  toasterNotify: (text: string) => void
}> = ({close, done, exportEndpoint, toasterNotify}) => {
  const form = useForm<{
    fileType: 'csv' | 'json'
  }>({
    fileType: 'csv',
  })

  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Export',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(Poster, {
            title: 'Export Data',
            description:
              'Export all app data as a flat zip archive containing only the selected file type.',
          }),
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {
                label: 'File Type',
              }),
              $(InputSelect, {
                value: form.data.fileType,
                valueSet: (value) =>
                  form.link('fileType')(value as 'csv' | 'json'),
                options: [
                  {key: 'csv', label: 'CSV'},
                  {key: 'json', label: 'JSON'},
                ],
              }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormBadge, {
                grow: true,
                label: 'Cancel',
                click: close,
                disabled: exportEndpoint.loading,
              }),
              $(FormBadge, {
                grow: true,
                label: exportEndpoint.loading ? 'Loading' : 'Export',
                disabled: exportEndpoint.loading,
                click: async () => {
                  const blob = await exportEndpoint.fetch({
                    fileType: form.data.fileType,
                  })
                  const filename = `frisbee-export-${form.data.fileType}-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`
                  download.blob(blob as Blob, filename)
                  toasterNotify('Export downloaded.')
                  done()
                },
              }),
            ]),
          }),
        ]),
      }),
    ]),
  })
}

type TGamedayScheduleEnabled = 'yes' | 'no'

interface TGamedayImportForm {
  username: string
  password: string
  association: string
  competition: string
  scheduleEnabled: TGamedayScheduleEnabled
  scheduleStartOn?: string
  scheduleEndOn?: string
}

const readGamedayImportFormDefaults = (
  config?: TGamedayImportConfigSafe,
): TGamedayImportForm => ({
  username: config?.username ?? '',
  password: '',
  association: config?.association ?? '',
  competition: config?.competition ?? '',
  scheduleEnabled: config?.scheduleEnabled ? 'yes' : 'no',
  scheduleStartOn: config?.scheduleStartOn,
  scheduleEndOn: config?.scheduleEndOn,
})

export const _DashboardGamedayImportConfig: FC<{
  close: () => void
  reload: () => Promise<void>
  season: TSeason
  state?: TGamedayImportState
}> = ({close, reload, season, state}) => {
  const toaster = useToaster()
  const $gamedaySave = useEndpoint($PortGamedayImportSave)
  const config = state?.config
  const form = useForm<TGamedayImportForm>(
    readGamedayImportFormDefaults(config),
  )
  const loading = $gamedaySave.loading
  const passwordComplete =
    Boolean(config?.hasPassword) || form.data.password.trim().length > 0
  const scheduleComplete =
    form.data.scheduleEnabled === 'no' ||
    Boolean(form.data.scheduleStartOn && form.data.scheduleEndOn)
  const complete =
    [
      form.data.username,
      form.data.association,
      form.data.competition,
    ].every((value) => value.trim().length > 0) &&
    passwordComplete &&
    scheduleComplete
  const scheduleDisabled = loading || form.data.scheduleEnabled === 'no'
  const scheduleTimezone: string =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local time'
  const scheduleRunTime: string = form.data.scheduleStartOn
    ? dayjs(form.data.scheduleStartOn).format('h:mma')
    : '12:00am'
  const labelWidth = theme.fib[10]

  useEffect(() => {
    if (state) form.set(readGamedayImportFormDefaults(config))
  }, [config?.id, config?.updatedOn])

  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'GameDay Import Settings',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: !state
          ? $(Spinner)
          : addkeys([
              $(Poster, {
                title: 'GameDay Import Settings',
                description:
                  'Save the GameDay credentials and optional daily schedule for this season. Use the separate run button when you want to start an import.',
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Username',
                  }),
                  $(InputString, {
                    value: form.data.username,
                    valueSet: form.link('username'),
                    disabled: loading,
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Password',
                  }),
                  $(InputString, {
                    type: 'password',
                    value: form.data.password,
                    valueSet: form.link('password'),
                    placeholder: config?.hasPassword
                      ? 'Leave blank to keep saved password'
                      : 'Enter GameDay password',
                    disabled: loading,
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Association',
                  }),
                  $(FormColumn, {
                    grow: true,
                    children: addkeys([
                      $(InputString, {
                        value: form.data.association,
                        valueSet: form.link('association'),
                        disabled: loading,
                      }),
                      $(FormHelp, {
                        children:
                          'Case-sensitive GameDay association name.',
                      }),
                    ]),
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Competition',
                  }),
                  $(FormColumn, {
                    grow: true,
                    children: addkeys([
                      $(InputString, {
                        value: form.data.competition,
                        valueSet: form.link('competition'),
                        disabled: loading,
                      }),
                      $(FormHelp, {
                        children:
                          'Case-sensitive GameDay competition name.',
                      }),
                    ]),
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Daily Schedule',
                  }),
                  $(FormColumn, {
                    grow: true,
                    children: addkeys([
                      $(InputSelect<TGamedayScheduleEnabled>, {
                        value: form.data.scheduleEnabled,
                        valueSet: form.link('scheduleEnabled'),
                        disabled: loading,
                        options: [
                          {key: 'no', label: 'Disabled'},
                          {key: 'yes', label: 'Enabled'},
                        ],
                      }),
                      $(FormHelp, {
                        children: `Runs once daily after ${scheduleRunTime} ${scheduleTimezone}.`,
                      }),
                    ]),
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Active From',
                  }),
                  $(InputDate, {
                    value: form.data.scheduleStartOn,
                    valueSet: form.link('scheduleStartOn'),
                    disabled: scheduleDisabled,
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Active Until',
                  }),
                  $(InputDate, {
                    value: form.data.scheduleEndOn,
                    valueSet: form.link('scheduleEndOn'),
                    disabled: scheduleDisabled,
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormBadge, {
                    grow: true,
                    label: 'Close',
                    click: close,
                    disabled: loading,
                  }),
                  $(FormBadge, {
                    grow: true,
                    icon: $gamedaySave.loading ? 'spinner' : undefined,
                    label: $gamedaySave.loading ? 'Saving' : 'Save Settings',
                    disabled: loading || !complete,
                    click: () => {
                      void $gamedaySave
                        .fetch({
                          seasonId: season.id,
                          username: form.data.username,
                          password: form.data.password,
                          association: form.data.association,
                          competition: form.data.competition,
                          scheduleEnabled: form.data.scheduleEnabled === 'yes',
                          scheduleStartOn: form.data.scheduleStartOn,
                          scheduleEndOn: form.data.scheduleEndOn,
                        })
                        .then(async () => {
                          toaster.notify('GameDay import settings saved.')
                          form.patch({password: ''})
                          await reload()
                        })
                        .catch(() => undefined)
                    },
                  }),
                ]),
              }),
            ]),
      }),
    ]),
  })
}


export const _DashboardGamedayImportRunConfirmation: FC<{
  close: () => void
  done: () => void
  reload: () => Promise<void>
  season: TSeason
  config?: TGamedayImportConfigSafe
}> = ({close, done, reload, season, config}) => {
  const toaster = useToaster()
  const $gamedayImport = useEndpoint($PortGamedayImport)
  const loading = $gamedayImport.loading
  const labelWidth = theme.fib[10]

  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Run GameDay Import',
          }),
          $(TopBarBadge, {
            icon: 'times',
            click: loading ? undefined : close,
          }),
        ]),
      }),
      $(Form, {
        background: theme.bgMinor,
        children: !config
          ? addkeys([
              $(Poster, {
                icon: 'exclamation-triangle',
                title: 'GameDay Settings Required',
                description:
                  'Save the GameDay import settings before running an import.',
              }),
              $(FormBadge, {
                label: 'Close',
                click: close,
              }),
            ])
          : addkeys([
              $(Poster, {
                icon: 'cloud-download-alt',
                title: 'Confirm GameDay Import Run',
                description: `This will sign in to GameDay with the saved encrypted credentials and import members into ${season.name}.`,
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Username',
                  }),
                  $(FormBadge, {
                    grow: true,
                    label: config.username,
                    select: 'text',
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Association',
                  }),
                  $(FormBadge, {
                    grow: true,
                    label: config.association,
                    select: 'text',
                  }),
                ]),
              }),
              $(FormRow, {
                bpColumn: theme.fib[12],
                children: addkeys([
                  $(FormLabel, {
                    width: labelWidth,
                    label: 'Competition',
                  }),
                  $(FormBadge, {
                    grow: true,
                    label: config.competition,
                    select: 'text',
                  }),
                ]),
              }),
              $(FormHelp, {
                children:
                  'The import may create teams, users, and memberships. Existing members are skipped where they already exist.',
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormBadge, {
                    grow: true,
                    label: 'Cancel',
                    click: close,
                    disabled: loading,
                  }),
                  $(FormBadge, {
                    grow: true,
                    icon: loading ? 'spinner' : undefined,
                    label: loading ? 'Running' : 'Confirm Run',
                    disabled: loading,
                    click: () => {
                      void $gamedayImport
                        .fetch({seasonId: season.id})
                        .then(async (summary) => {
                          toaster.notify(
                            `GameDay import finished. ${summary.membersCreated} membership(s) added.`,
                          )
                          await reload()
                          done()
                        })
                        .catch(() => {
                          void reload().catch(() => undefined)
                        })
                    },
                  }),
                ]),
              }),
            ]),
      }),
    ]),
  })
}

export const _DashboardImport: FC<{
  done: () => void
  close: () => void
  season: TSeason
}> = ({done, close, season}) => {
  const ref = useRef<HTMLInputElement | null>(null)
  const [csv, csvSet] = useState<File>()
  const $import = useEndpoint($PortImport)
  return $(Fragment, {
    children: addkeys([
      $('input', {
        ref,
        type: 'file',
        accept: ['.csv'],
        className: css({
          display: 'none',
        }),
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          if (event.target.files?.length) csvSet(event.target.files[0])
        },
      }),
      $(Modal, {
        children: addkeys([
          $(TopBar, {
            children: addkeys([
              $(TopBarBadge, {
                grow: true,
                label: 'Import CSV',
              }),
              $(TopBarBadge, {
                icon: 'times',
                click: close,
              }),
            ]),
          }),
          !csv
            ? $(Form, {
                background: theme.bgMinor,
                children: addkeys([
                  $('div', {
                    className: css({
                      whiteSpace: 'pre-line',
                    }),
                    children: `
The expected headings in the CSV are:
- team_name
- team_division (optional)
- first_name
- last_name
- email_address
- gender

                      `.trim(),
                  }),
                  $(FormBadge, {
                    label: 'Select File',
                    click: () => ref.current?.click(),
                  }),
                ]),
              })
            : $(Fragment, {
                children: addkeys([
                  $(Poster, {
                    title: 'Ready To Upload',
                    description: csv.name,
                  }),
                  $(Form, {
                    children: addkeys([
                      $(FormBadge, {
                        disabled: $import.loading,
                        icon: $import.loading ? 'spinner' : undefined,
                        label: $import.loading ? 'Loading' : 'Upload',
                        click: () => {
                          const data = new FormData()
                          data.set('csv', csv)
                          data.set('seasonId', season.id)
                          $import.fetch(data).then(done)
                        },
                      }),
                      $(FormBadge, {
                        label: 'Change File',
                        click: () => ref.current?.click(),
                      }),
                    ]),
                  }),
                ]),
              }),
        ]),
      }),
    ]),
  })
}
