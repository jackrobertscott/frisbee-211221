import dompurify from 'dompurify'
import {css} from '@emotion/css'
import {createElement as $, FC, MutableRefObject, useRef, useState} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Form} from '../Form/Form'
import {FormBadge} from '../Form/FormBadge'
import {FormColumn} from '../Form/FormColumn'
import {FormMenu} from '../Form/FormMenu'
import {FormRow} from '../Form/FormRow'
import {Popup} from '../Popup'
import {InputString} from './InputString'
/**
 *
 */
export const InputHTMLLegacy: FC<{
  value?: string
  valueSet?: (value: string) => void
  blur?: () => void
  enter?: () => void
  disabled?: boolean
  maxHeight?: number
  minHeight?: number
}> = ({value: _value, valueSet, blur, disabled, maxHeight, minHeight}) => {
  const value = _value === undefined ? '' : _value
  const ref = useRef<HTMLElement>()
  const [html] = useState(() => dompurify.sanitize(value))
  return $(FormColumn, {
    grow: true,
    children: addkeys([
      $(_InputHTMLActions, {
        refHTML: ref,
      }),
      $('div', {
        ref,
        contentEditable: !disabled,
        dangerouslySetInnerHTML: {
          __html: html,
        },
        onBlur: () => !disabled && blur?.(),
        onInput: (event: InputEvent) =>
          !disabled &&
          event.target instanceof HTMLElement &&
          valueSet?.(event.target?.innerHTML),
        className: css({
          minHeight,
          maxHeight,
          flexGrow: 1,
          overflow: 'auto',
          maxWidth: '100%',
          border: theme.border(),
          background: theme.bg.string(),
          padding: theme.padify(theme.fib[4]),
          whiteSpace: 'pre-line',
          '&::placeholder': {
            color: theme.fontPlaceholder.string(),
          },
        }),
      }),
    ]),
  })
}
/**
 *
 */
const _InputHTMLActions: FC<{
  refHTML: MutableRefObject<HTMLElement | undefined>
}> = ({refHTML}) => {
  const range = useRef<Range>()
  return $('div', {
    className: css({
      border: theme.border(),
      background: theme.bgMinor.string(),
      overflow: 'hidden',
      display: 'flex',
      '& > *': {
        margin: -theme.borderWidth,
        marginRight: 0,
      },
    }),
    children: addkeys([
      [
        ['Unformat', 'remove-format', 'removeformat'],
        ['Bold', 'bold', 'bold'],
        ['Italic', 'italic', 'italic'],
        ['Underline', 'underline', 'underline'],
        ['Strikethrough', 'strikethrough', 'strikethrough'],
        ['Align Left', 'align-left', 'justifyLeft'],
        ['Align Center', 'align-center', 'justifyCenter'],
        ['Align Right', 'align-right', 'justifyRight'],
        ['List Ordered', 'list-ol', 'insertOrderedList'],
        ['List Unordered', 'list-ul', 'insertUnorderedList'],
      ].map(([_, icon, command]) => {
        return $(FormBadge, {
          key: command,
          icon: icon,
          click: (event) => {
            if (event?.preventDefault) event.preventDefault()
            document.execCommand(command)
          },
        })
      }),
      $(_InputHTMLSelect, {
        icon: 'font',
        options: [
          'Arial',
          'Verdana',
          'Helvetica',
          'Tahoma',
          'Trebuchet MS',
          'Times New Roman',
          'Georgia',
          'Garamond',
          'Courier New',
          'Brush Script MT',
        ].map((i) => ({
          label: i,
          family: i,
          click: () => document.execCommand('fontName', false, i),
        })),
      }),
      $(_InputHTMLSelect, {
        icon: 'heading',
        options: [
          {key: 'p', label: 'Regular Text'},
          {key: 'pre', label: 'Code'},
          {key: 'h1', label: 'Heading 1'},
          {key: 'h2', label: 'Heading 2'},
          {key: 'h3', label: 'Heading 3'},
          {key: 'h4', label: 'Heading 4'},
          {key: 'h5', label: 'Heading 5'},
          {key: 'h6', label: 'Heading 6'},
        ].map((i) => ({
          ...i,
          click: () => document.execCommand('formatblock', false, i.key),
        })),
      }),
      $(_InputHTMLAnchor, {
        open: () => {
          refHTML.current?.focus()
          range.current = document.getSelection()?.getRangeAt(0)
        },
        done: (href) => {
          refHTML.current?.focus()
          const sel = document.getSelection()
          if (!sel) return
          if (!range.current) return
          if (range.current.toString().length === 0) {
            const urlNode = document.createElement('div')
            urlNode.innerHTML = href
            range.current.insertNode(urlNode)
          }
          sel.removeAllRanges()
          sel.addRange(range.current)
          document.execCommand('createlink', false, href)
        },
      }),
    ]),
  })
}
/**
 *
 */
const _InputHTMLSelect: FC<{
  icon: string
  options: Array<{
    key?: string
    label: string
    color?: string
    family?: string
    click?: () => void
  }>
}> = ({icon, options}) => {
  const [open, openSet] = useState(false)
  return $(Popup, {
    open,
    align: 'start',
    clickOutside: () => openSet(false),
    wrap: $(FormBadge, {
      icon,
      click: () => openSet(true),
    }),
    popup: $(FormMenu, {
      maxWidth: '100%',
      minWidth: theme.fib[11],
      maxHeight: theme.fib[12] + theme.fib[5],
      options: options.map((i) => ({
        ...i,
        click: () => {
          i.click?.()
          openSet(false)
        },
      })),
    }),
  })
}
/**
 *
 */
const _InputHTMLAnchor: FC<{
  done: (href: string) => void
  open: () => void
}> = ({done, open: _open}) => {
  const [open, _openSet] = useState(false)
  const [href, hrefSet] = useState('')
  const openSet = (state: boolean) => {
    if (state) _open()
    _openSet(state)
  }
  const submit = () => {
    done(href)
    openSet(false)
  }
  return $(Popup, {
    open,
    align: 'center',
    clickOutside: () => openSet(false),
    wrap: $(FormBadge, {
      icon: 'link',
      click: () => openSet(true),
    }),
    popup: $(Form, {
      width: theme.fib[12],
      background: theme.bgMinor,
      children: addkeys([
        $(FormRow, {
          children: addkeys([
            $(FormBadge, {label: 'Href'}),
            $(InputString, {
              value: href,
              valueSet: hrefSet,
              enter: submit,
            }),
          ]),
        }),
        $(FormBadge, {
          click: submit,
          label: 'Submit',
        }),
      ]),
    }),
  })
}
