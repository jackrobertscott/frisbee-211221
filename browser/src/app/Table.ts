import {css, cx} from '@emotion/css'
import {createElement as $, FC, Fragment, ReactNode} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'

type TFCTable<T extends string = string> = FC<{
  grow?: boolean
  head: Record<
    T,
    {
      label: string
      grow: number
      click?: () => void
      icon?: string
      prefixIcon?: string
    }
  >
  body: Array<{
    key: string
    click?: () => void
    data: Record<
      T,
      {
        children?: ReactNode
        value?: string | number
        color?: string
        icon?: string
      }
    >
  }>
}>

export const Table: TFCTable = ({head, body, grow}) => {
  return $('div', {
    className: css({
      display: 'flex',
      flexDirection: 'column',
      flexBasis: grow ? 0 : undefined,
      flexGrow: grow ? 1 : undefined,
      minHeight: 0,
      maxWidth: '100%',
      overflow: 'auto',
      background: theme.bgMinor.string(),
      borderBottom: theme.border(),
      boxShadow: [
        `inset ${theme.borderWidth}px 0 0 ${theme.borderColor.string()}`,
        `inset -${theme.borderWidth}px 0 0 ${theme.borderColor.string()}`,
      ].join(', '),
    }),
    children: $(FormColumn, {
      maxWidth: '100%',
      children: addkeys([
        $(FormRow, {
          shrink: false,
          className: _tableHeadRow,
          children: Object.entries(head).map(
            ([key, {grow, label, click, icon, prefixIcon}]) => {
              return $(_TableCell, {
                key,
                grow,
                children: $(FormLabel, {
                  icon: prefixIcon,
                  label,
                  background: theme.bgMinor,
                  select: 'text',
                  grow: true,
                  click,
                  suffixIcon: icon,
                  style: {
                    justifyContent: icon ? 'space-between' : 'flex-start',
                    cursor: click ? 'pointer' : undefined,
                  },
                }),
              })
            },
          ),
        }),
        $(Fragment, {
          children: body.length
            ? body.map((entry, index) => {
                return $(FormRow, {
                  key: entry.key,
                  click: entry.click,
                  className: cx(
                    entry.click ? _tableClickableRow : undefined,
                    index === body.length - 1 ? _tableBottomRow : undefined,
                  ),
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
                          background: bg,
                          font: data ? font : font?.merge({a: 0.5}),
                          select: !entry.click ? 'text' : undefined,
                          icon: data.icon,
                          wrap: true,
                          grow: true,
                        }),
                    })
                  }),
                })
              })
            : $(FormLabel, {
                label: 'Empty',
                font: theme.fontMinor,
                style: {
                  borderBottom: 'none',
                },
              }),
        }),
      ]),
    }),
  })
}

const _tableHeadRow = css({
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: theme.bgMinor.string(),
  '& > div > div': {
    borderBottom: theme.border(),
  },
})

const _tableBottomRow = css({
  '& > div > div': {
    borderBottom: theme.border(),
  },
})

const _tableClickableRow = css({
  '& > div > div': {
    transition: 'box-shadow 120ms ease',
  },
  '&:hover > div > div': {
    boxShadow: `inset 0 0 0 999px ${theme.bg.compliment()
      .merge({a: -0.82})
      .string()}`,
  },
  '&:active > div > div': {
    boxShadow: `inset 0 0 0 999px ${theme.bg.compliment()
      .merge({a: -0.74})
      .string()}`,
  },
})

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
      alignSelf: 'stretch',
      minWidth: theme.fib[8] * grow,
      overflow: 'hidden',
      '& > *': {
        flexGrow: 1,
      },
      '& div': {
        borderBottom: 'none',
      },
    }),
  })
}
