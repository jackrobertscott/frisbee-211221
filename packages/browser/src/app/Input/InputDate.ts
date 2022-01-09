import dayjs from 'dayjs'
import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, useEffect, useState} from 'react'
import {theme} from '../../theme'
import {Popup} from '../Popup'
import {Spinner} from '../Spinner'
import {Form} from '../Form/Form'
import {addkeys} from '../../utils/addkeys'
import {FormRow} from '../Form/FormRow'
import {InputSelect} from './InputSelect'
import {DATETIME_DAYS, DATETIME_MONTHS, DATETIME_YEARS} from '../../utils/dates'
import {FormColumn} from '../Form/FormColumn'
import {hsla} from '../../utils/hsla'
/**
 *
 */
export const InputDate: FC<{
  value?: string
  valueSet?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  minWidth?: number
}> = ({value, valueSet, placeholder = '...', disabled, minWidth}) => {
  const [open, openSet] = useState(false)
  const dateCurrent = value ? dayjs(value) : undefined
  const [dateViewing, dateViewingSet] = useState(() => {
    return dateCurrent?.clone() ?? dayjs()
  })
  useEffect(() => {
    if (dateCurrent && dateCurrent.toISOString() !== dateViewing.toISOString())
      dateViewingSet(dateCurrent.clone())
  }, [value])
  return $(Popup, {
    open,
    align: 'start',
    clickOutside: () => openSet(false),
    style: {
      flexGrow: 1,
    },
    wrap: $('div', {
      onClick: () => {
        if (disabled) return
        if (!value) valueSet?.(dayjs().startOf('day').toISOString())
        openSet(true)
      },
      children: dateCurrent?.format('D MMM YYYY') ?? placeholder ?? '...',
      className: css({
        minWidth,
        cursor: 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        background: theme.bg.string(),
        color: value ? undefined : theme.fontPlaceholder.string(),
        padding: theme.padify(theme.fib[4]),
        border: theme.border(),
      }),
    }),
    popup: dateCurrent
      ? $(_InputDatePicker, {
          dateCurrent,
          dateViewing,
          valueSet,
          viewingSet: (i) => dateViewingSet(dayjs(i)),
        })
      : $(Spinner),
  })
}
/**
 *
 */
const _InputDatePicker: FC<{
  dateCurrent: dayjs.Dayjs
  dateViewing: dayjs.Dayjs
  valueSet?: (value: string) => void
  viewingSet: (value: string) => void
}> = ({dateCurrent, dateViewing, valueSet, viewingSet}) => {
  const startOfMonth = dateViewing.startOf('month')
  console.log(dateViewing.year().toString())
  const today = dayjs()
  return $(Form, {
    width: 377,
    children: addkeys([
      $(FormRow, {
        children: addkeys([
          $(InputSelect, {
            value: dateViewing.month().toString(),
            valueSet: (value) =>
              viewingSet(dateViewing.set('month', +value).toISOString()),
            options: DATETIME_MONTHS.map((i, index) => ({
              key: index.toString(),
              label: i,
            })),
          }),
          $(InputSelect, {
            value: dateViewing.year().toString(),
            valueSet: (value) =>
              viewingSet(dateViewing.set('year', +value).toISOString()),
            options: DATETIME_YEARS.map((i) => ({
              key: i,
              label: i,
            })),
          }),
        ]),
      }),
      $(FormColumn, {
        children: addkeys([
          $(FormRow, {
            children: DATETIME_DAYS.map((day) => {
              return $('div', {
                key: day,
                children: day.slice(0, 2),
                className: css({
                  flexGrow: 1,
                  flexBasis: 0,
                  textAlign: 'center',
                  color: theme.fontMinor.string(),
                  background: theme.bgMinor.string(),
                  padding: theme.padify(theme.fib[4]),
                  border: theme.border(),
                }),
              })
            }),
          }),
          $(Fragment, {
            children: new Array(6).fill(0).map((_, indexWeek) => {
              const startOfWeek = startOfMonth
                .startOf('week')
                .add(indexWeek, 'week')
              return $(FormRow, {
                key: indexWeek,
                children: new Array(7).fill(0).map((_, indexDay) => {
                  const dayOfWeek = startOfWeek.add(indexDay, 'day')
                  const sameMonth = dateViewing.month() === dayOfWeek.month()
                  const isSelected = dateCurrent.isSame(dayOfWeek, 'date')
                  const isToday = today.isSame(dayOfWeek, 'date')
                  return $('div', {
                    key: indexDay,
                    children: dayOfWeek.date(),
                    onClick: () => {
                      const next = dateCurrent
                        .set('year', dayOfWeek.year())
                        .set('month', dayOfWeek.month())
                        .set('date', dayOfWeek.date())
                        .toISOString()
                      valueSet?.(next)
                    },
                    className: css({
                      flexGrow: 1,
                      flexBasis: 0,
                      cursor: 'pointer',
                      textAlign: 'center',
                      border: theme.border(),
                      padding: theme.padify(theme.fib[4]),
                      color: isSelected
                        ? hsla.string(0, 0, 100)
                        : sameMonth
                        ? theme.font.string()
                        : theme.fontMinor.string(),
                      background: isSelected
                        ? hsla.string(210, 100, 50)
                        : isToday
                        ? hsla.string(0, 100, 75)
                        : sameMonth
                        ? hsla.string(0, 0, 90)
                        : hsla.string(0, 0, 85),
                      '&:hover': !isSelected && {
                        background: sameMonth
                          ? hsla.string(0, 0, 80)
                          : hsla.string(0, 0, 75),
                      },
                    }),
                  })
                }),
              })
            }),
          }),
        ]),
      }),
    ]),
  })
}
