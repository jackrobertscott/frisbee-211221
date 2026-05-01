import {css} from '@emotion/css'
import dayjs from 'dayjs'
import {createElement as $, ChangeEvent, FC, Fragment, useRef, useState} from 'react'
import {TSeason} from '@shared/schemas/ioSeason'
import {$PortExport, $PortImport} from '../../endpoints/Port'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {download} from '../../utils/download'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {MockDeleteConfirmation} from '../MockDeleteConfirmation'
import {MockGenerate} from '../MockGenerate'
import {Modal} from '../Modal'
import {Poster} from '../Poster'
import {Question} from '../Question'
import {useToaster} from '../Toaster/useToaster'
import {TopBar, TopBarBadge} from '../TopBar'
import {useEndpoint} from '../useEndpoint'

export const DashboardPort: FC = () => {
  const auth = useAuth()
  const toaster = useToaster()
  const [importing, importingSet] = useState(false)
  const [exporting, exportingSet] = useState(false)
  const [generating, generatingSet] = useState(false)
  const [deleting, deletingSet] = useState(false)
  const $export = useEndpoint($PortExport)

  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin,
        children: $('div', {
          className: css({
            display: 'flex',
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
            description:
              'Export all app data as a zip archive containing JSON backups, CSV copies, and a manifest?',
            options: [
              {
                label: 'Cancel',
                click: () => exportingSet(false),
                disabled: $export.loading,
              },
              {
                label: $export.loading ? 'Loading' : 'Export',
                disabled: $export.loading,
                click: async () => {
                  const blob = await $export.fetch({})
                  const filename = `frisbee-export-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`
                  download.blob(blob as Blob, filename)
                  toaster.notify('Export downloaded.')
                  exportingSet(false)
                },
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
