import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
/**
 *
 */
export const DashboardShop: FC = () => {
  return $('iframe', {
    title: 'Marlow Shop',
    src: 'https://marlow-street-ultimate.square.site/s/shop?fbclid=IwAR21rulDg_KiLtXACWJmW1bm08W0xoVqRHLie3L12-bg0_0Rtqu8ObB2LDs',
    className: css({
      height: '70vh',
      outline: 'none',
      boxShadow: 'none',
      border: 'none',
    }),
  })
}
