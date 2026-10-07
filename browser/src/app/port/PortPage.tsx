import {TGamedayImportRun} from '@shared/schemas/ioGamedayImport'
import {IconTile, Text} from '@ui'
import {
  ChevronRight,
  CloudDownload,
  Download,
  FileUp,
  Pencil,
  Settings2,
  Trash2,
} from 'lucide-react'
import {type ReactNode, useEffect, useState} from 'react'
import {useAuth} from '../../core/auth/useAuth'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {useLoad} from '../../core/hooks/useLoad'
import {$PortGamedayImportLoad} from '../../core/endpoints/Port'
import {
  GamedayRunConfirmDialog,
  GamedayRunDialog,
  GamedayRunsCard,
  GamedaySettingsDialog,
} from './Gameday'
import {
  ExportDialog,
  ImportCsvDialog,
  MockDeleteDialog,
  MockGenerateDialog,
} from './PortDialogs'
import {useShell} from '../shell/ShellProvider'
import './port.css'

type TTool = 'import' | 'gameday' | 'run' | 'export' | 'mock' | 'delete'

interface TToolDef {
  id: TTool
  icon: ReactNode
  title: string
  body: string
  disabled?: boolean
  danger?: boolean
}

export function PortPage() {
  const auth = useAuth()
  const shell = useShell()
  const season = auth.season
  const seasonId = season?.id
  const [tool, toolSet] = useState<TTool | null>(null)
  const [run, runSet] = useState<TGamedayImportRun>()
  const $load = useEndpoint($PortGamedayImportLoad)
  const gameday = useLoad(
    () =>
      seasonId ? $load.fetch({seasonId}) : Promise.resolve(undefined),
    [seasonId, shell.version],
  )
  useEffect(() => {
    gameday.set(undefined)
    runSet(undefined)
  }, [seasonId])
  const config = gameday.data?.config
  const close = (open: boolean) => !open && toolSet(null)

  const tools: TToolDef[] = [
    {
      id: 'import',
      icon: <FileUp />,
      title: 'Import CSV',
      body: 'Bulk-add teams and members from a spreadsheet.',
      disabled: !season,
    },
    {
      id: 'gameday',
      icon: <Settings2 />,
      title: 'GameDay settings',
      body: config
        ? `Saved for ${config.association} / ${config.competition}.`
        : 'Save GameDay credentials and the daily schedule.',
      disabled: !season,
    },
    {
      id: 'run',
      icon: <CloudDownload />,
      title: 'Run GameDay import',
      body: config
        ? 'Import members from GameDay now.'
        : 'Save GameDay settings first.',
      disabled: !season || !config,
    },
    {
      id: 'export',
      icon: <Download />,
      title: 'Export data',
      body: 'Download all app data as a CSV or JSON zip archive.',
    },
    {
      id: 'mock',
      icon: <Pencil />,
      title: 'Create mock data',
      body: 'Generate mock teams and users in this season.',
      disabled: !season,
    },
    {
      id: 'delete',
      icon: <Trash2 />,
      title: 'Delete mock data',
      body: 'Permanently remove every generated mock record.',
      danger: true,
    },
  ]

  return (
    <div className="fr-page">
      <div className="fr-tools">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className="fr-tool"
            data-danger={t.danger || undefined}
            disabled={t.disabled}
            onClick={() => toolSet(t.id)}
          >
            <IconTile size="sm">{t.icon}</IconTile>
            <span className="fr-tool__text">
              <Text as="span" size="sm" weight="medium">
                {t.title}
              </Text>
              <Text as="span" size="xs" tone="tertiary" className="fr-tool__body">
                {t.body}
              </Text>
            </span>
            <ChevronRight className="fr-tool__chevron" aria-hidden />
          </button>
        ))}
      </div>

      {season && (
        <GamedayRunsCard
          state={gameday.data}
          loading={gameday.loading}
          onOpenRun={runSet}
        />
      )}

      {season && (
        <>
          <ImportCsvDialog
            open={tool === 'import'}
            onOpenChange={close}
            season={season}
            onDone={shell.invalidate}
          />
          <GamedaySettingsDialog
            open={tool === 'gameday'}
            onOpenChange={close}
            season={season}
            state={gameday.data}
            reload={gameday.reload}
          />
          <GamedayRunConfirmDialog
            open={tool === 'run'}
            onOpenChange={close}
            season={season}
            config={config}
            reload={gameday.reload}
          />
          <MockGenerateDialog
            open={tool === 'mock'}
            onOpenChange={close}
            season={season}
            onDone={shell.invalidate}
          />
        </>
      )}
      <ExportDialog open={tool === 'export'} onOpenChange={close} />
      <MockDeleteDialog
        open={tool === 'delete'}
        onOpenChange={close}
        onDone={shell.invalidate}
      />
      <GamedayRunDialog run={run} onClose={() => runSet(undefined)} />
    </div>
  )
}
