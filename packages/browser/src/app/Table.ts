import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, ReactNode} from 'react'
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
    data: Record<
      T,
      {children?: ReactNode; value?: string | number; color?: string}
    >
  }>
}>
/**
 *
 */
export const Table: TFCTable = ({head, body}) => {
  return $(FormColumn, {
    children: addkeys([
      $(FormRow, {
        children: Object.entries(head).map(([key, {grow, label}]) => {
          return $('div', {
            key,
            className: css({
              minWidth: theme.fib[8] * grow,
              flexGrow: grow,
              flexShrink: 0,
              flexBasis: 0,
              display: 'flex',
              flexDirection: 'column',
            }),
            children: $(FormLabel, {
              label,
              background: theme.bgMinor,
              style: {
                overflow: 'auto',
                flexGrow: 1,
              },
            }),
          })
        }),
      }),
      $(Fragment, {
        children: body.map((entry) => {
          return $(FormRow, {
            key: entry.key,
            click: entry.click,
            children: Object.entries(head).map(([key, {grow}]) => {
              const data = entry.data[key]
              return $('div', {
                key,
                className: css({
                  minWidth: theme.fib[8] * grow,
                  flexGrow: grow,
                  flexShrink: 0,
                  flexBasis: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }),
                children:
                  data?.children ??
                  $(FormLabel, {
                    label:
                      data?.value !== undefined ? data.value.toString() : '...',
                    background: data?.color
                      ? hsla
                          .digest(data?.color)
                          .merge({a: entry.click ? -0.5 : 0})
                      : hsla.create(0, 0, 0, 0),
                    font: data ? undefined : hsla.create(0, 0, 0, 0.5),
                    style: {
                      overflow: 'auto',
                      flexGrow: 1,
                    },
                  }),
              })
            }),
          })
        }),
      }),
    ]),
  })
}
