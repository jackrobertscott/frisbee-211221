import {css} from '@emotion/css'
import {createElement as $, FC, Fragment} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
/**
 *
 */
type TFCTable<T extends string = any> = FC<{
  head: Record<T, {label: string; grow: number}>
  body: Array<
    Record<'id' | T, undefined | {value?: string | number; color?: string}>
  >
}>
/**
 *
 */
export const Table: TFCTable = ({head: header, body}) => {
  return $('div', {
    className: css({
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
      background: theme.bgColor,
      border: theme.border,
      '& > *:not(:last-child)': {
        borderBottom: theme.border,
      },
    }),
    children: addkeys([
      $('div', {
        className: css({
          display: 'flex',
          background: theme.bgMinorColor,
          '& > *:not(:last-child)': {
            borderRight: theme.border,
          },
        }),
        children: Object.entries(header).map(([key, {grow, label}]) => {
          return $('div', {
            key,
            children: label,
            className: css({
              minWidth: 55 * grow,
              flexGrow: grow,
              flexShrink: 0,
              flexBasis: 0,
              overflow: 'auto',
              padding: theme.padify(theme.inputPadding),
            }),
          })
        }),
      }),
      $(Fragment, {
        children: body.map((entry) => {
          return $('div', {
            key: entry.id?.value,
            className: css({
              display: 'flex',
              '& > *:not(:last-child)': {
                borderRight: theme.border,
              },
            }),
            children: Object.entries(header).map(([key, {grow}]) => {
              const data = entry[key]
              return $('div', {
                key,
                children: data?.value !== undefined ? data?.value : '...',
                className: css({
                  minWidth: 55 * grow,
                  flexGrow: grow,
                  flexShrink: 0,
                  flexBasis: 0,
                  overflow: 'auto',
                  background: data?.color,
                  padding: theme.padify(theme.inputPadding),
                  color: data ? undefined : hsla.string(0, 0, 0, 0.5),
                }),
              })
            }),
          })
        }),
      }),
    ]),
  })
}
