import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, ReactNode, ReactText} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
/**
 *
 */
type TFCTable<T extends string = any> = FC<{
  head: Record<T, {label: string; grow: number}>
  body: Array<{
    key: string
    click?: () => void
    data: Record<T, {children?: ReactNode; value?: ReactText; color?: string}>
  }>
}>
/**
 *
 */
export const Table: TFCTable = ({head, body}) => {
  return $('div', {
    className: css({
      overflow: 'auto',
      background: theme.bg.string(),
    }),
    children: $(FormColumn, {
      grow: true,
      maxWidth: '100%',
      children: addkeys([
        $(FormRow, {
          children: Object.entries(head).map(([key, {grow, label}]) => {
            return $(_TableCell, {
              key,
              grow,
              children: $(FormLabel, {
                label,
                background: theme.bgMinor,
                select: 'text',
                grow: true,
              }),
            })
          }),
        }),
        $(Fragment, {
          children: body.length
            ? body.map((entry) => {
                return $(FormRow, {
                  key: entry.key,
                  click: entry.click,
                  children: Object.entries(head).map(([key, {grow}]) => {
                    const data = entry.data[key]
                    const bg = data?.color
                      ? hsla.digest(data?.color)
                      : undefined
                    const font = bg?.compliment()
                    const badnum =
                      typeof data.value === 'number' &&
                      (isNaN(data.value) || Math.abs(data.value) === Infinity)
                    return $(_TableCell, {
                      key,
                      grow,
                      children:
                        data?.children ??
                        $(FormLabel, {
                          label:
                            data?.value !== undefined && !badnum
                              ? data.value.toString()
                              : '...',
                          background: bg
                            ? bg.merge({a: entry.click ? -0.5 : 0})
                            : hsla.create(0, 0, 0, 0),
                          font: data ? font : font?.merge({a: 0.5}),
                          select: !entry.click ? 'text' : undefined,
                          grow: true,
                        }),
                    })
                  }),
                })
              })
            : $(FormLabel, {
                font: theme.fontMinor,
                label: 'Empty',
              }),
        }),
      ]),
    }),
  })
}
/**
 *
 */
const _TableCell: FC<{
  grow: number
  children: ReactNode
}> = ({grow, children}) => {
  return $('div', {
    children,
    className: css({
      display: 'flex',
      flexBasis: 0,
      flexShrink: 0,
      flexGrow: grow,
      flexDirection: 'column',
      minWidth: theme.fib[8] * grow,
      overflow: 'hidden',
    }),
  })
}
