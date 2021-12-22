import {css} from '@emotion/css'
import {createElement as $, FC, useEffect, useState} from 'react'
import {$Test} from '../endpoints/User'
import {useEndpoint} from './useEndpoint'
/**
 *
 */
export const App: FC = () => {
  const $test = useEndpoint($Test)
  const [message, messageSet] = useState('...')
  useEffect(() => {
    $test.fetch({name: 'Jack'}).then((i) => messageSet(i.hello))
  }, [])
  return $('div', {
    children: message,
    className: css({
      padding: 13,
    }),
  })
}
