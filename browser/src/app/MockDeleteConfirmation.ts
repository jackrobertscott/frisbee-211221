import {createElement as $, FC} from 'react'
import {$PortDeleteAllMockData} from '../endpoints/Port'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Form} from './Form/Form'
import {FormBadge} from './Form/FormBadge'
import {Modal} from './Modal'
import {Poster} from './Poster'
import {useToaster} from './Toaster/useToaster'
import {TopBar, TopBarBadge} from './TopBar'
import {useEndpoint} from './useEndpoint'

export const MockDeleteConfirmation: FC<{
  close: () => void
  done: () => void
}> = ({close, done}) => {
  const toaster = useToaster()
  const $deleteData = useEndpoint($PortDeleteAllMockData)

  return $(Modal, {
    width: theme.fib[12],
    children: addkeys([
      $(TopBar, {
        children: addkeys([
          $(TopBarBadge, {
            grow: true,
            label: 'Delete All Mock Data',
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
            icon: 'exclamation-triangle',
            title: 'Warning',
            description:
              'This action will permanently delete all mock data including teams, users, members, and related reports. This action cannot be undone.',
          }),
          $(FormBadge, {
            disabled: $deleteData.loading,
            label: $deleteData.loading ? 'Deleting...' : 'Delete All Mock Data',
            click: () => {
              $deleteData
                .fetch()
                .then(() => {
                  toaster.notify('All mock data has been deleted successfully')
                  done()
                })
                .catch(() => {
                  close()
                })
            },
          }),
          $(FormBadge, {
            label: 'Cancel',
            click: close,
          }),
        ]),
      }),
    ]),
  })
}
