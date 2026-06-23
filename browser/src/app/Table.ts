import {css, cx} from '@emotion/css'
import {createElement as $, FC, Fragment, ReactNode} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {FormColumn} from './Form/FormColumn'
import {FormLabel} from './Form/FormLabel'
import {FormRow} from './Form/FormRow'
import {Icon} from './Icon'

const MOBILE_TABLE_MIN_HEIGHT = 300

type TTableEmpty = {
  label?: string
  description?: string
  icon?: string
}

type TFCTable<T extends string = string> = FC<{
  grow?: boolean
  trimBottom?: boolean
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
  empty?: string | TTableEmpty
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

export const Table: TFCTable = ({
  head,
  body,
  empty,
  grow,
  trimBottom = !grow,
}) => {
  const showFooterSpace = !trimBottom
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
      borderLeft: theme.border(),
      borderRight: theme.border(),
      borderBottom: theme.border(),
      [theme.ltMedia(theme.fib[13])]: {
        minHeight: grow ? MOBILE_TABLE_MIN_HEIGHT : undefined,
      },
    }),
    children: $(FormColumn, {
      className: _tableContent,
      grow,
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
                    showFooterSpace && index === body.length - 1
                      ? _tableBottomRow
                      : undefined,
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
            : $(_TableEmpty, {empty}),
        }),
        showFooterSpace &&
          body.length > 0 &&
          $('div', {
            className: _tableFooterSpace,
          }),
      ]),
    }),
  })
}

const _tableContent = css({
  '& > div > div:first-child > div': {
    borderLeft: 'none',
  },
  '& > div > div:last-child > div': {
    borderRight: 'none',
  },
})

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

const _tableFooterSpace = css({
  flexShrink: 0,
  marginTop: theme.borderWidth,
  minHeight: theme.fib[5],
  background: theme.bgMinor.string(),
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

const _TableEmpty: FC<{
  empty?: string | TTableEmpty
}> = ({empty}) => {
  const label = typeof empty === 'string' ? empty : empty?.label
  const description = typeof empty === 'string' ? undefined : empty?.description
  const icon = typeof empty === 'string' ? undefined : empty?.icon
  return $('div', {
    role: 'status',
    className: _tableEmpty,
    children: $('div', {
      className: _tableEmptyCard,
      children: addkeys([
        $(Icon, {
          icon: icon ?? 'inbox',
          multiple: 1,
        }),
        $('div', {
          className: _tableEmptyTitle,
          children: label ?? 'No rows to show',
        }),
        $('div', {
          className: _tableEmptyDescription,
          children:
            description ?? "Rows will appear here when they're available.",
        }),
      ]),
    }),
  })
}

const _tableEmpty = css({
  flexGrow: 1,
  minHeight: theme.fib[11],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.fib[8],
  borderTop: theme.border(),
  background: `radial-gradient(circle at center, ${theme.bgHighlight
    .merge({a: -0.78})
    .string()} 0, transparent 62%), linear-gradient(135deg, ${theme.bgMinor.string()}, ${theme.bg
    .merge({a: -0.08})
    .string()})`,
  color: theme.fontMinor.string(),
})

const _tableEmptyCard = css({
  width: 'min(100%, 377px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.fib[4],
  padding: `${theme.fib[7]}px ${theme.fib[8]}px`,
  border: theme.border(),
  borderRadius: theme.fib[6],
  background: theme.bg.merge({a: -0.06}).string(),
  boxShadow: `0 ${theme.fib[4]}px ${theme.fib[8]}px ${hsla.string(
    0,
    0,
    0,
    0.08,
  )}`,
  textAlign: 'center',
  '& > div:first-child': {
    width: theme.fib[9],
    height: theme.fib[9],
    borderRadius: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.bgHighlight.compliment().string(),
    background: `linear-gradient(135deg, ${theme.bgHighlight.string()}, ${theme.bgHighlight
      .lighten(8)
      .string()})`,
    boxShadow: `0 ${theme.fib[3]}px ${theme.fib[6]}px ${hsla.string(
      0,
      0,
      0,
      0.1,
    )}`,
  },
})

const _tableEmptyTitle = css({
  color: theme.font.string(),
  fontSize: theme.fontSizeMajor,
  fontWeight: 700,
  lineHeight: 1.2,
})

const _tableEmptyDescription = css({
  maxWidth: theme.fib[12],
  color: theme.fontMinor.string(),
  fontSize: theme.fontSizeMinor,
  lineHeight: 1.45,
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
