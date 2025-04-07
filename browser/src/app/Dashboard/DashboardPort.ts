import {css} from '@emotion/css'
import {TSeason} from '@shared/schemas/ioSeason'
import {
  createElement as $,
  ChangeEvent,
  FC,
  Fragment,
  useRef,
  useState,
} from 'react'
import {$PortExport, $PortImport} from '../../endpoints/Port'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
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
/**
 *
 */
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
    ]),
  })
}
/**
 *
 */
export const _DashboardImport: FC<{
  done: () => void
  close: () => void
  season: TSeason
}> = ({done, close, season}) => {
  const ref = useRef<HTMLElement>()
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
