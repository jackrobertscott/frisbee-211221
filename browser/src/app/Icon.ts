import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {spin} from '../utils/keyframes'
/**
 *
 */
export const Icon: FC<{
  icon: string
  prefix?: string
  multiple?: number
  width?: string
  collapse?: boolean
  rotate?: number
}> = ({
  icon,
  prefix = 'fas',
  multiple = 0.7,
  width = '0.9em',
  collapse,
  rotate,
}) => {
  return $('div', {
    className: css({
      width: collapse ? undefined : width,
      height: '1.32em', // .02 less than normal text
      display: 'flex',
      justifyContent: 'center',
      alignContent: 'center',
      alignItems: 'center',
    }),
    children: $('div', {
      className: [
        prefix,
        `fa-${icon}`,
        css({
          animation:
            icon === 'spinner' ? `${spin} 1.5s linear infinite` : undefined,
          transform: rotate ? `rotate(${rotate}deg)` : undefined,
          fontSize: `${multiple}em`,
          lineHeight: '1em',
          textAlign: 'center',
          textDecoration: 'none',
        }),
      ].join(' '),
    }),
  })
}
