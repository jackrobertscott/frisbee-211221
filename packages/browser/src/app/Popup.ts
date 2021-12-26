import {css, CSSInterpolation} from '@emotion/css'
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
import {DepthProvider} from './Depth/DepthProvider'
import {useDepth} from './Depth/useDepth'
import {Portal} from './Portal'
/**
 *
 */
export const Popup: FC<{
  open: boolean
  wrap: ReactNode
  popup: ReactNode
  style?: CSSInterpolation
  align?: 'start' | 'center' | 'end'
  position?: 'above' | 'below'
  clickOutside?: () => void
}> = ({
  open,
  wrap,
  popup,
  style,
  align = 'end',
  position = 'below',
  clickOutside,
}) => {
  const depth = useDepth()
  const wrapRef = useRef<HTMLElement>()
  const popupRef = useRef<HTMLElement>()
  const [box, boxSet] = useState<DOMRect>()
  const offset = {x: 0, y: 3}
  const alignValue = (data: Partial<Record<typeof align, any>>) => data[align]
  const posValue = (data: Partial<Record<typeof position, any>>) =>
    data[position]
  useEffect(() => {
    if (open) {
      boxSet(wrapRef.current?.getBoundingClientRect())
      const clickOutsideHandler = (event: MouseEvent) => {
        if (!depth.atTop() || !clickOutside) return
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
  return $('div', {
    ref: wrapRef,
    className: css(style, {
      position: 'relative',
    }),
    children: addkeys([
      wrap,
      open &&
        box &&
        $(DepthProvider, {
          children: $(Portal, {
            children: $('div', {
              ref: popupRef,
              className: css({
                width: box.width,
                height: box.height,
                pointerEvents: 'none',
                position: 'absolute',
                top: box.top,
                right: box.right,
                left: box.left,
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
                      top: posValue({below: '100%'}),
                      bottom: posValue({above: '100%'}),
                      left: alignValue({start: offset.x + 8, center: '50%'}),
                      right: alignValue({end: offset.x + 8}),
                      transform: `${
                        alignValue({center: 'translateX(-50%)'}) ?? ''
                      } rotate(45deg)`.trim(),
                      background: theme.borderColor,
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
                      border: theme.border,
                      background: theme.bgColor,
                      boxShadow: [
                        `0 0 10px ${hsla.string(0, 0, 0, 0.1)}`,
                        `0 0 50px ${hsla.string(0, 0, 0, 0.1)}`,
                      ].join(', '),
                    }),
                    children: $('div', {
                      children: popup,
                      className: css({
                        position: 'relative',
                        zIndex: 100,
                      }),
                    }),
                  }),
                  $('div', {
                    className: css({
                      position: 'absolute',
                      top: posValue({below: '100%'}),
                      bottom: posValue({above: '100%'}),
                      left: alignValue({start: offset.x + 8, center: '50%'}),
                      right: alignValue({end: offset.x + 8}),
                      transform: `${
                        alignValue({center: 'translateX(-50%)'}) ?? ''
                      } rotate(45deg)`.trim(),
                      background: theme.bgColor,
                      marginTop: posValue({below: offset.y + 3}),
                      marginBottom: posValue({above: offset.y + 3}),
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
