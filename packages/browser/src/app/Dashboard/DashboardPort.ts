import {css} from '@emotion/css'
import {
  ChangeEvent,
  createElement as $,
  FC,
  Fragment,
  useRef,
  useState,
} from 'react'
import {$PortExport, $PortImport} from '../../endpoints/Port'
import {TSeason} from '../../schemas/ioSeason'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {useAuth} from '../Auth/useAuth'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
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
  const $export = useEndpoint($PortExport)
  return $(Fragment, {
    children: addkeys([
      $(Form, {
        background: theme.bgAdmin.lighten(5),
        children: addkeys([
          $(FormBadge, {
            label: 'Import TopScore CSV',
            background: theme.bgAdmin,
            click: () => importingSet(true),
          }),
          $(FormBadge, {
            label: 'Export CSV',
            background: theme.bgAdmin,
            click: () => exportingSet(true),
          }),
        ]),
      }),
      $(Fragment, {
        children:
          importing &&
          auth.current?.season &&
          $(_DashboardImport, {
            season: auth.current.season,
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
        accept: '.csv',
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
                children: $(FormBadge, {
                  label: 'Select File',
                  click: () => ref.current?.click(),
                }),
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
