import {css, CSSObject} from '@emotion/css'
import {
  createElement as $,
  FC,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla} from '../utils/hsla'
import {StackProvider} from './Stack/StackProvider'
import {useStack} from './Stack/useStack'
import {Portal} from './Portal'
/**
 *
 */
export const Popup: FC<{
  open: boolean
  wrap: ReactNode
  popup: ReactNode
  style?: CSSObject
  align?: 'start' | 'center' | 'end'
  position?: 'above' | 'below'
  clickOutside?: () => void
  maxWidth?: number | string
}> = ({
  open,
  wrap,
  popup,
  style,
  align = 'end',
  position = 'below',
  clickOutside,
  maxWidth,
}) => {
  const depth = useStack()
  const wrapRef = useRef<HTMLElement>()
  const popupRef = useRef<HTMLElement>()
  const contentRef = useRef<HTMLElement>()
  const [box, boxSet] = useState<DOMRect>()
  const [adjust, adjustSet] = useState({x: 0, y: 0})
  const offset = {x: 0, y: 3}
  const alignValue = (data: Partial<Record<typeof align, any>>) => data[align]
  const posValue = (data: Partial<Record<typeof position, any>>) =>
    data[position]
  useEffect(() => {
    if (open) {
      boxSet(wrapRef.current?.getBoundingClientRect())
      const clickOutsideHandler = (event: MouseEvent) => {
        if (!depth.top() || !clickOutside) return
        const clickedOutside =
          popupRef.current &&
          event.target instanceof HTMLElement &&
          !popupRef.current.contains(event.target)
        if (clickedOutside) clickOutside()
      }
      document.addEventListener('click', clickOutsideHandler)
      return () => document.removeEventListener('click', clickOutsideHandler)
    } else if (box) {
      boxSet(undefined)
    }
  }, [open])
  useEffect(() => {
    if (box) {
      const data = contentRef.current?.getBoundingClientRect()
      if (data) {
        if (data.bottom > window.innerHeight)
          adjustSet((i) => ({
            ...i,
            y: data.bottom - window.innerHeight + theme.fib[5],
          }))
        if (data.right > window.innerWidth) {
          console.log(data.right, window.innerWidth)
          adjustSet((i) => ({
            ...i,
            x: data.right - window.innerWidth + theme.fib[5],
          }))
        }
      }
    } else {
      if (adjust.y || adjust.x) adjustSet({x: 0, y: 0})
    }
  }, [box])
  return $('div', {
    ref: wrapRef,
    className: css(style, {
      position: 'relative',
    }),
    children: addkeys([
      wrap,
      open &&
        box &&
        $(StackProvider, {
          children: $(Portal, {
            children: $('div', {
              ref: popupRef,
              className: css({
                width: box.width,
                height: box.height,
                pointerEvents: 'none',
                position: 'absolute',
                top: box.top - adjust.y,
                right: box.right - adjust.x,
                left: box.left - adjust.x,
                zIndex: 100,
              }),
              children: $('div', {
                className: css({
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                }),
                children: addkeys([
                  $('div', {
                    className: css({
                      position: 'absolute',
                      display: adjust.x || adjust.y ? 'none' : undefined,
                      top: posValue({below: '100%'}),
                      bottom: posValue({above: '100%'}),
                      left: alignValue({start: offset.x + 8, center: '50%'}),
                      right: alignValue({end: offset.x + 8}),
                      transform: `${
                        alignValue({center: 'translateX(-50%)'}) ?? ''
                      } rotate(45deg)`.trim(),
                      background: theme.borderColor.string(),
                      marginTop: posValue({below: offset.y}),
                      marginBottom: posValue({above: offset.y}),
                      height: 13,
                      width: 13,
                    }),
                  }),
                  $('div', {
                    className: css({
                      position: 'absolute',
                      pointerEvents: 'all',
                      top: posValue({below: '100%'}),
                      bottom: posValue({above: '100%'}),
                      left: alignValue({start: offset.x, center: '50%'}),
                      right: alignValue({end: offset.x}),
                      transform: alignValue({center: 'translateX(-50%)'}),
                      marginTop: posValue({below: offset.y + 5}),
                      marginBottom: posValue({above: offset.y + 5}),
                      background: theme.bg.string(),
                      border: theme.border(),
                      boxShadow: [
                        `0 0 10px ${hsla.string(0, 0, 0, 0.1)}`,
                        `0 0 50px ${hsla.string(0, 0, 0, 0.1)}`,
                      ].join(', '),
                    }),
                    children: $('div', {
                      ref: contentRef,
                      children: popup,
                      className: css({
                        maxWidth,
                        position: 'relative',
                        zIndex: 100,
                      }),
                    }),
                  }),
                  $('div', {
                    className: css({
                      position: 'absolute',
                      display: adjust.x || adjust.y ? 'none' : undefined,
                      top: posValue({below: '100%'}),
                      bottom: posValue({above: '100%'}),
                      left: alignValue({start: offset.x + 8, center: '50%'}),
                      right: alignValue({end: offset.x + 8}),
                      transform: `${
                        alignValue({center: 'translateX(-50%)'}) ?? ''
                      } rotate(45deg)`.trim(),
                      background: theme.bg.string(),
                      marginTop: posValue({
                        below: offset.y + theme.borderWidth + 1,
                      }),
                      marginBottom: posValue({
                        above: offset.y + theme.borderWidth + 1,
                      }),
                      height: 13,
                      width: 13,
                    }),
                  }),
                ]),
              }),
            }),
          }),
        }),
    ]),
  })
}
