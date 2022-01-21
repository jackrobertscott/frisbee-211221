import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {FormBadge} from '../Form/FormBadge'
import {FormRow} from '../Form/FormRow'
import {InputSelect} from '../Input/InputSelect'
import {TPager} from './usePager'
/**
 *
 */
export const Pager: FC<{
  count?: number
  total?: number
  data: TPager
  dataSet: (pager: TPager) => void
}> = ({count, total, data, dataSet}) => {
  const hasNext = () => total && data.skip + data.limit < total
  const hasPrev = () => data.skip > 0
  const goNext = () => dataSet({...data, skip: data.skip + data.limit})
  const goPrev = () =>
    dataSet({
      ...data,
      skip: data.skip - data.limit < 0 ? 0 : data.skip - data.limit,
    })
  return $(FormRow, {
    children: addkeys([
      $('div', {
        children: $(InputSelect, {
          position: 'above',
          minWidth: theme.fib[9],
          value: data.limit.toString(),
          valueSet: (limit) => dataSet({...data, limit: +limit, skip: 0}),
          options: [
            {key: '10', label: '10'},
            {key: '25', label: '25'},
            {key: '50', label: '50'},
            {key: '100', label: '100'},
            {key: '250', label: '250'},
          ],
        }),
      }),
      $(FormBadge, {
        grow: true,
        label: `${data.skip} to ${count ? data.skip + count : '...'} of ${
          total ?? '...'
        }`,
      }),
      $(FormBadge, {
        icon: 'arrow-left',
        disabled: !hasPrev(),
        click: () => goPrev(),
      }),
      $(FormBadge, {
        icon: 'arrow-right',
        disabled: !hasNext(),
        click: () => goNext(),
      }),
    ]),
  })
}
