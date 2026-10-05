import {TSeason} from '@shared/schemas/ioSeason'
import {
  Alert,
  Button,
  Code,
  ConfirmDialog,
  Dialog,
  Field,
  FileDropzone,
  FileItem,
  NumberInput,
  RadioGroup,
  Radio,
  Stack,
  Text,
  toast,
} from '@ui'
import {Database, Download, FileUp, Pencil, Trash2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useEndpoint} from '../../core/endpoints/useEndpoint'
import {
  $PortDeleteAllMockData,
  $PortExport,
  $PortImport,
  $PortMockGenerate,
} from '../../core/endpoints/Port'
import {downloadBlob} from '../../core/download'
import {fileStamp} from './format'

interface TDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CSV_HEADINGS: {name: string; optional?: boolean}[] = [
  {name: 'team_name'},
  {name: 'team_division', optional: true},
  {name: 'first_name'},
  {name: 'last_name'},
  {name: 'email_address'},
  {name: 'gender'},
]

export function ImportCsvDialog({
  open,
  onOpenChange,
  season,
  onDone,
}: TDialogProps & {season: TSeason; onDone: () => void}) {
  const $import = useEndpoint($PortImport)
  const [csv, csvSet] = useState<File>()
  const loading = $import.loading
  useEffect(() => {
    if (open) csvSet(undefined)
  }, [open])
  const upload = () => {
    if (!csv) return
    const data = new FormData()
    data.set('csv', csv)
    data.set('seasonId', season.id)
    $import
      .fetch(data)
      .then(() => {
        toast.success('Import finished.')
        onOpenChange(false)
        onDone()
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      dismissable={!loading}
      icon={<FileUp />}
      title="Import CSV"
      description={`Members are imported into ${season.name}.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leading={<FileUp />}
            disabled={!csv}
            loading={loading}
            onClick={upload}
          >
            {loading ? 'Uploading' : 'Upload'}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <div>
          <Text size="sm" weight="medium">
            The expected headings in the CSV are:
          </Text>
          <ul className="fr-port-headings">
            {CSV_HEADINGS.map((h) => (
              <li key={h.name}>
                <Code>{h.name}</Code>
                {h.optional && (
                  <Text as="span" size="xs" tone="tertiary">
                    optional
                  </Text>
                )}
              </li>
            ))}
          </ul>
        </div>
        {csv ? (
          <Stack gap={2}>
            <Text size="sm" weight="medium">
              Ready to upload
            </Text>
            <FileItem
              name={csv.name}
              size={csv.size}
              status="complete"
              onRemove={loading ? undefined : () => csvSet(undefined)}
            />
            <FileDropzone
              compact
              accept=".csv,text/csv"
              multiple={false}
              disabled={loading}
              onFiles={(files) => files[0] && csvSet(files[0])}
              hint="Change file — CSV only"
            />
          </Stack>
        ) : (
          <FileDropzone
            accept=".csv,text/csv"
            multiple={false}
            onFiles={(files) => files[0] && csvSet(files[0])}
            hint="CSV files only"
          />
        )}
      </Stack>
    </Dialog>
  )
}

type TFileType = 'csv' | 'json'

export function ExportDialog({open, onOpenChange}: TDialogProps) {
  const $export = useEndpoint($PortExport)
  const [fileType, fileTypeSet] = useState<TFileType>('csv')
  const loading = $export.loading
  useEffect(() => {
    if (open) fileTypeSet('csv')
  }, [open])
  const exportNow = () => {
    $export
      .fetch({fileType})
      .then((blob: unknown) => {
        if (!(blob instanceof Blob)) throw new Error('Export did not return a file.')
        downloadBlob(blob, `frisbee-export-${fileType}-${fileStamp()}.zip`)
        toast.success('Export downloaded.')
        onOpenChange(false)
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === 'Export did not return a file.')
          toast.error(error.message)
      })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      dismissable={!loading}
      icon={<Database />}
      title="Export data"
      description="Export all app data as a flat zip archive containing only the selected file type."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            leading={<Download />}
            loading={loading}
            onClick={exportNow}
          >
            {loading ? 'Exporting' : 'Export'}
          </Button>
        </>
      }
    >
      <Field label="File type">
        <RadioGroup
          value={fileType}
          onValueChange={(v) => fileTypeSet(v === 'json' ? 'json' : 'csv')}
          variant="card"
        >
          <Radio value="csv" label="CSV" description="One .csv file per collection." />
          <Radio value="json" label="JSON" description="One .json file per collection." />
        </RadioGroup>
      </Field>
    </Dialog>
  )
}

export function MockGenerateDialog({
  open,
  onOpenChange,
  season,
  onDone,
}: TDialogProps & {season: TSeason; onDone: () => void}) {
  const $generate = useEndpoint($PortMockGenerate)
  const [teams, teamsSet] = useState<number | null>(null)
  const [usersPerTeam, usersPerTeamSet] = useState<number | null>(null)
  const [touched, touchedSet] = useState(false)
  const loading = $generate.loading
  useEffect(() => {
    if (open) {
      teamsSet(null)
      usersPerTeamSet(null)
      touchedSet(false)
    }
  }, [open])
  const teamsError =
    teams === null || teams < 1 ? 'Please enter a valid number of teams.' : undefined
  const usersError =
    usersPerTeam === null || usersPerTeam < 1
      ? 'Please enter a valid number of users per team.'
      : undefined
  const generate = () => {
    touchedSet(true)
    if (teams === null || teams < 1) return toast.error('Please enter a valid number of teams.')
    if (usersPerTeam === null || usersPerTeam < 1)
      return toast.error('Please enter a valid number of users per team.')
    $generate
      .fetch({seasonId: season.id, teams, usersPerTeam})
      .then(() => {
        toast.success('Mock data generated successfully')
        onOpenChange(false)
        onDone()
      })
      .catch(() => undefined)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      dismissable={!loading}
      icon={<Pencil />}
      title="Generate mock data"
      description={`Creates mock teams and users in ${season.name}.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={generate}>
            {loading ? 'Generating…' : 'Generate'}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <Alert tone="warning" title="Warning">
          Generating mock data is not reversible. This will create teams and users.
        </Alert>
        <div className="fr-grid-2 fr-port-grid">
          <Field label="Number of teams" required error={touched ? teamsError : undefined}>
            <NumberInput value={teams} onValueChange={teamsSet} min={1} disabled={loading} />
          </Field>
          <Field label="Users per team" required error={touched ? usersError : undefined}>
            <NumberInput
              value={usersPerTeam}
              onValueChange={usersPerTeamSet}
              min={1}
              disabled={loading}
            />
          </Field>
        </div>
      </Stack>
    </Dialog>
  )
}

export function MockDeleteDialog({
  open,
  onOpenChange,
  onDone,
}: TDialogProps & {onDone: () => void}) {
  const $delete = useEndpoint($PortDeleteAllMockData)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      icon={<Trash2 />}
      title="Delete all mock data?"
      description="This action will permanently delete all mock data including teams, users, members, and related reports. This action cannot be undone."
      confirmLabel="Delete all mock data"
      confirmVariant="danger"
      onConfirm={() =>
        $delete
          .fetch()
          .then(() => {
            toast.success('All mock data has been deleted successfully')
            onDone()
          })
      }
    />
  )
}
