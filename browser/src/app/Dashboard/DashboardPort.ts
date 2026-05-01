import {css} from '@emotion/css'
import {TGamedayAccountSettings} from '@shared/schemas/ioGamedayAccountSettings'
import {TSeason} from '@shared/schemas/ioSeason'
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
  $GamedayAccountSettingsConnect,
  $GamedayAccountSettingsCreate,
  $GamedayAccountSettingsDelete,
  $GamedayAccountSettingsListOfSeason,
  $GamedayAccountSettingsUpdate,
} from '../../endpoints/Gameday'
import {$PortExport, $PortImport} from '../../endpoints/Port'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {objectify} from '../../utils/objectify'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormLabel} from '../Form/FormLabel'
import {FormRow} from '../Form/FormRow'
import {InputString} from '../Input/InputString'
import {MockDeleteConfirmation} from '../MockDeleteConfirmation'
import {MockGenerate} from '../MockGenerate'
import {Modal} from '../Modal'
import {Poster} from '../Poster'
import {Question} from '../Question'
import {Spinner} from '../Spinner'
import {Table} from '../Table'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'
import {useForm} from '../useForm'

const GAMEDAY_DEFAULTS = {
  name: '',
  organisationId: '',
  tokenUrl: '',
  apiBaseUrl: '',
  clientId: '',
  oauthClientSecret: '',
  grantType: 'client_credentials',
  scope: '',
}

const GAMEDAY_COMPARE_KEYS = [
  'name',
  'organisationId',
  'tokenUrl',
  'apiBaseUrl',
  'clientId',
  'oauthClientSecret',
  'grantType',
  'scope',
] as const

type TGamedayForm = typeof GAMEDAY_DEFAULTS

export const DashboardPort: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const [importing, importingSet] = useState(false)
  const [exporting, exportingSet] = useState(false)
  const [generating, generatingSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const [creatingGameday, creatingGamedaySet] = useState(false)
  const [gamedayAccounts, gamedayAccountsSet] = useState<
    TGamedayAccountSettings[] | undefined
  >()
  const [currentGamedayId, currentGamedayIdSet] = useState<string>()
  const $export = useEndpoint($PortExport)
  const $gamedayList = useEndpoint($GamedayAccountSettingsListOfSeason)
  const seasonId = auth.season!.id
  const currentGameday =
    currentGamedayId &&
    gamedayAccounts?.find((account) => account.id === currentGamedayId)
  const gamedayList = () =>
    $gamedayList.fetch({seasonId}).then((data) => {
      gamedayAccountsSet(data)
    })

  useEffect(() => {
    gamedayList()
  }, [seasonId])

  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin,
        children: $('div', {
          className: css({
            display: 'flex',
            '& > *:not(:last-child)': {
              marginRight: theme.fib[5],
              [theme.ltMedia(theme.fib[14])]: {
                marginRight: 0,
                marginBottom: theme.fib[5],
              },
            },
            [theme.ltMedia(theme.fib[14])]: {
              flexDirection: 'column',
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
              icon: 'upload',
              label: 'Export CSV',
              background: theme.bgAdminButton,
              click: () => exportingSet(true),
            }),
            $(FormBadge, {
              grow: true,
              icon: 'magic',
              label: 'Generate Mock Data',
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
      }),
      $(Form, {
        background: theme.bgMinor,
        children: addkeys([
          $(FormRow, {
            children: addkeys([
              $(FormLabel, {
                grow: true,
                label: 'Gameday OAuth Accounts',
                background: theme.bgMinor,
              }),
              $(FormBadge, {
                label: 'Add Account',
                background: theme.bgAdminButton,
                noshrink: true,
                click: () => creatingGamedaySet(true),
              }),
            ]),
          }),
          gamedayAccounts === undefined
            ? $(Spinner)
            : $(Table, {
                head: {
                  name: {label: 'Name', grow: 2},
                  organisationId: {label: 'Organisation', grow: 2},
                  apiBaseUrl: {label: 'API Base URL', grow: 3},
                  lastConnectedOn: {label: 'Connected', grow: 2},
                  updatedOn: {label: 'Updated', grow: 2},
                },
                body: gamedayAccounts.map((account) => ({
                  key: account.id,
                  click: () => currentGamedayIdSet(account.id),
                  data: {
                    name: {value: account.name},
                    organisationId: {value: account.organisationId},
                    apiBaseUrl: {value: account.apiBaseUrl},
                    lastConnectedOn: {
                      value: account.lastConnectedOn
                        ? dayjs(account.lastConnectedOn).format(
                            'DD/MM/YY h:mma'
                          )
                        : 'Never',
                    },
                    updatedOn: {
                      value: dayjs(account.updatedOn).format('DD/MM/YY h:mma'),
                    },
                  },
                })),
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
          $(Question, {
            close: () => exportingSet(false),
            title: 'Export',
            description: 'Are you sure you wish to export all app data?',
            options: [
              {label: 'Cancel', click: () => exportingSet(false)},
              {
                label: $export.loading ? 'Loading' : 'Export',
                click: () =>
                  $export.fetch({}).then(({email}) => {
                    const message = `An email has been sent "${email}" containing a link to the export.`
                    toaster.notify(message)
                    exportingSet(false)
                  }),
              },
            ],
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
      $(Fragment, {
        children:
          creatingGameday &&
          $(_DashboardPortGamedayCreate, {
            seasonId,
            close: () => creatingGamedaySet(false),
            done: (account) => {
              gamedayAccountsSet((existing) => [account, ...(existing ?? [])])
              creatingGamedaySet(false)
              currentGamedayIdSet(account.id)
              toaster.notify('GameDay account saved.')
            },
          }),
      }),
      $(Fragment, {
        children:
          currentGameday &&
          $(_DashboardPortGamedayView, {
            gamedayAccount: currentGameday,
            close: () => currentGamedayIdSet(undefined),
            gamedayAccountSet: (account) => {
              if (!account) {
                gamedayAccountsSet((existing) =>
                  existing?.filter((item) => item.id !== currentGameday.id)
                )
                currentGamedayIdSet(undefined)
                toaster.notify('GameDay account deleted.')
                return
              }
              gamedayAccountsSet((existing) =>
                existing?.map((item) =>
                  item.id === account.id ? account : item
                )
              )
              toaster.notify('GameDay account updated.')
            },
          }),
      }),
    ]),
  })
}

const _DashboardPortGamedayCreate: FC<{
  seasonId: string
  close: () => void
  done: (account: TGamedayAccountSettings) => void
}> = ({seasonId, close, done}) => {
  const $create = useEndpoint($GamedayAccountSettingsCreate)
  return $(_DashboardPortGamedayForm, {
    title: 'New GameDay Account',
    defaults: GAMEDAY_DEFAULTS,
    close,
    saveLabel: 'Save Account',
    onSave: (value) =>
      $create.fetch({...value, seasonId}).then((account) => {
        done(account)
        return account
      }),
  })
}

const _DashboardPortGamedayView: FC<{
  gamedayAccount: TGamedayAccountSettings
  gamedayAccountSet: (value?: TGamedayAccountSettings) => void
  close: () => void
}> = ({gamedayAccount, gamedayAccountSet, close}) => {
  const [deleting, deletingSet] = useState(false)
  const $delete = useEndpoint($GamedayAccountSettingsDelete)
  const $update = useEndpoint($GamedayAccountSettingsUpdate)
  return $(Fragment, {
    children: addkeys([
      $(_DashboardPortGamedayForm, {
        title: 'GameDay Account',
        defaults: {
          name: gamedayAccount.name,
          organisationId: gamedayAccount.organisationId,
          tokenUrl: gamedayAccount.tokenUrl,
          apiBaseUrl: gamedayAccount.apiBaseUrl,
          clientId: gamedayAccount.clientId,
          oauthClientSecret: '',
          grantType: gamedayAccount.grantType,
          scope: gamedayAccount.scope ?? '',
        },
        close,
        createdOn: gamedayAccount.createdOn,
        updatedOn: gamedayAccount.updatedOn,
        lastConnectedOn: gamedayAccount.lastConnectedOn,
        gamedayAccountSettingsId: gamedayAccount.id,
        hasStoredOauthClientSecret: gamedayAccount.hasOauthClientSecret,
        deleteClick: () => deletingSet(true),
        saveLabel: 'Save Changes',
        onConnected: (account) => gamedayAccountSet(account),
        onSave: (value) =>
          $update.fetch({
            gamedayAccountSettingsId: gamedayAccount.id,
            ...value,
          })
            .then((account) => {
              gamedayAccountSet(account)
              return account
            }),
      }),
      $(Fragment, {
        children:
          deleting &&
          $(Question, {
            title: 'Delete GameDay Account',
            description:
              'Are you sure you wish to permanently delete this GameDay account?',
            close: () => deletingSet(false),
            options: [
              {label: 'Cancel', click: () => deletingSet(false)},
              {
                label: $delete.loading ? 'Loading' : 'Delete',
                click: () =>
                  $delete
                    .fetch({
                      gamedayAccountSettingsId: gamedayAccount.id,
                    })
                    .then(() => {
                      deletingSet(false)
                      gamedayAccountSet(undefined)
                    }),
              },
            ],
          }),
      }),
    ]),
  })
}

const _DashboardPortGamedayForm: FC<{
  title: string
  defaults: TGamedayForm
  close: () => void
  saveLabel: string
  createdOn?: string
  updatedOn?: string
  lastConnectedOn?: string
  gamedayAccountSettingsId?: string
  hasStoredOauthClientSecret?: boolean
  deleteClick?: () => void
  onConnected?: (account: TGamedayAccountSettings) => void
  onSave: (value: TGamedayForm) => Promise<TGamedayAccountSettings>
}> = ({
  title,
  defaults,
  close,
  saveLabel,
  createdOn,
  updatedOn,
  lastConnectedOn,
  gamedayAccountSettingsId,
  hasStoredOauthClientSecret,
  deleteClick,
  onConnected,
  onSave,
}) => {
  const toaster = useToaster()
  const form = useForm(defaults)
  const $connect = useEndpoint($GamedayAccountSettingsConnect)
  const [connectedOn, connectedOnSet] = useState<string | undefined>(
    lastConnectedOn
  )
  const [saving, savingSet] = useState(false)
  const isDifferent = !objectify.compareKeys(defaults, form.data, [
    ...GAMEDAY_COMPARE_KEYS,
  ])
  const canConnect =
    !!form.data.name.trim() &&
    !!form.data.organisationId.trim() &&
    !!form.data.tokenUrl.trim() &&
    !!form.data.apiBaseUrl.trim() &&
    !!form.data.clientId.trim() &&
    (
      Boolean(hasStoredOauthClientSecret) ||
      !!form.data.oauthClientSecret.trim()
    ) &&
    !!form.data.grantType.trim()

  const payload = () => ({
    ...form.data,
    ...(gamedayAccountSettingsId
      ? {gamedayAccountSettingsId}
      : {}),
    ...(form.data.oauthClientSecret.trim()
      ? {}
      : {oauthClientSecret: ''}),
  })

  const fieldSet =
    <K extends keyof TGamedayForm>(key: K) =>
    (value: TGamedayForm[K]) => {
      connectedOnSet(undefined)
      form.patch({[key]: value} as Partial<TGamedayForm>)
    }

  const connect = () =>
    $connect.fetch(payload()).then((data) => {
      connectedOnSet(data.connectedOn)
      if (data.account) onConnected?.(data.account)
      toaster.notify('GameDay OAuth account connected.')
    })

  const save = async () => {
    savingSet(true)
    try {
      await onSave(form.data)
      close()
    } finally {
      savingSet(false)
    }
  }

  return $(Modal, {
    width: theme.fib[13],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: title,
          }),
          $(Fragment, {
            children:
              deleteClick &&
              $(TopBarBadge, {
                icon: 'trash-alt',
                label: 'Delete',
                click: deleteClick,
              }),
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
          $(FormColumn, {
            children: addkeys([
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Name'}),
                  $(InputString, {
                    value: form.data.name,
                    valueSet: fieldSet('name'),
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Organisation ID'}),
                  $(InputString, {
                    value: form.data.organisationId,
                    valueSet: fieldSet('organisationId'),
                  }),
                ]),
              }),
            ]),
          }),
          $(FormColumn, {
            children: addkeys([
              $(FormLabel, {
                label: 'OAuth Connection',
                background: theme.bgMinor,
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Token URL'}),
                  $(InputString, {
                    value: form.data.tokenUrl,
                    valueSet: fieldSet('tokenUrl'),
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'API Base URL'}),
                  $(InputString, {
                    value: form.data.apiBaseUrl,
                    valueSet: fieldSet('apiBaseUrl'),
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Client ID'}),
                  $(InputString, {
                    value: form.data.clientId,
                    valueSet: fieldSet('clientId'),
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Client Secret'}),
                  $(InputString, {
                    type: 'password',
                    value: form.data.oauthClientSecret,
                    valueSet: fieldSet('oauthClientSecret'),
                    placeholder: hasStoredOauthClientSecret
                      ? 'Leave blank to keep stored secret'
                      : undefined,
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Grant Type'}),
                  $(InputString, {
                    value: form.data.grantType,
                    valueSet: fieldSet('grantType'),
                  }),
                ]),
              }),
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Scope'}),
                  $(InputString, {
                    value: form.data.scope,
                    valueSet: fieldSet('scope'),
                    placeholder: 'Optional',
                  }),
                ]),
              }),
            ]),
          }),
          $(FormColumn, {
            children: addkeys([
              $(FormRow, {
                children: addkeys([
                  $(FormLabel, {label: 'Connection Status'}),
                  $(FormLabel, {
                    grow: true,
                    background: connectedOn
                      ? theme.bgHighlight
                      : theme.bgDisabled,
                    label: connectedOn
                      ? `Connected ${dayjs(connectedOn).format(
                          'DD/MM/YY h:mma'
                        )}`
                      : hasStoredOauthClientSecret
                        ? 'Stored secret, not revalidated'
                        : 'Not connected',
                  }),
                ]),
              }),
              createdOn &&
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'Created'}),
                    $(FormLabel, {
                      grow: true,
                      background: theme.bgDisabled,
                      label: dayjs(createdOn).format('DD/MM/YY h:mma'),
                    }),
                  ]),
                }),
              updatedOn &&
                $(FormRow, {
                  children: addkeys([
                    $(FormLabel, {label: 'Last Updated'}),
                    $(FormLabel, {
                      grow: true,
                      background: theme.bgDisabled,
                      label: dayjs(updatedOn).format('DD/MM/YY h:mma'),
                    }),
                  ]),
                }),
            ]),
          }),
          $(FormRow, {
            children: addkeys([
              $(FormBadge, {
                grow: true,
                disabled: !canConnect || $connect.loading,
                icon: $connect.loading ? 'spinner' : 'plug',
                label: $connect.loading ? 'Connecting' : 'Connect OAuth',
                click: connect,
              }),
              isDifferent &&
                $(FormBadge, {
                  grow: true,
                  disabled: !connectedOn || saving,
                  label: saving ? 'Saving' : saveLabel,
                  click: save,
                  background: theme.bgAdminButton,
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
