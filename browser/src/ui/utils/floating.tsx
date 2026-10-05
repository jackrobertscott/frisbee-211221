import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import { Portal } from './Portal';
import { useLayer } from './layer';
import { mergeRefs, usePresence } from './hooks';
import { cx } from './cx';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';
export type Placement = Side | `${Side}-${Exclude<Align, 'center'>}`;

/** Anything with a bounding rect: an element, or a virtual point (context menus). */
export interface VirtualAnchor {
  getBoundingClientRect(): DOMRect;
  contains?(node: Node): boolean;
}
export type Anchor = Element | VirtualAnchor | null | undefined;

const PAD = 8;

function parse(p: Placement): [Side, Align] {
  const [s, a] = p.split('-') as [Side, Align | undefined];
  return [s, a ?? 'center'];
}

function compute(a: DOMRect, w: number, h: number, side: Side, align: Align, offset: number) {
  let x = 0;
  let y = 0;
  if (side === 'bottom' || side === 'top') {
    y = side === 'bottom' ? a.bottom + offset : a.top - h - offset;
    x = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2;
  } else {
    x = side === 'right' ? a.right + offset : a.left - w - offset;
    y = align === 'start' ? a.top : align === 'end' ? a.bottom - h : a.top + a.height / 2 - h / 2;
  }
  return { x, y };
}

const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Positions a fixed element against an anchor, flipping & shifting to stay in view. */
export function useFloating(opts: {
  open: boolean;
  anchor: Anchor;
  placement?: Placement;
  offset?: number;
  matchWidth?: boolean;
}) {
  const { open, anchor, placement = 'bottom-start', offset = 6, matchWidth } = opts;
  const floatRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<{ style: CSSProperties; side: Side }>({
    style: { position: 'fixed', top: 0, left: 0, visibility: 'hidden' },
    side: parse(placement)[0],
  });

  const update = useCallback(() => {
    const el = floatRef.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    if (matchWidth) el.style.minWidth = `${a.width}px`;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let [side, align] = parse(placement);
    let { x, y } = compute(a, w, h, side, align, offset);
    // Flip on the main axis if it overflows and the other side has more room.
    const overflows =
      (side === 'bottom' && y + h > vh - PAD) ||
      (side === 'top' && y < PAD) ||
      (side === 'right' && x + w > vw - PAD) ||
      (side === 'left' && x < PAD);
    if (overflows) {
      const room = { bottom: vh - a.bottom, top: a.top, right: vw - a.right, left: a.left };
      if (room[opposite[side]] > room[side]) {
        side = opposite[side];
        ({ x, y } = compute(a, w, h, side, align, offset));
      }
    }
    // Shift on the cross axis to stay inside the viewport.
    x = Math.max(PAD, Math.min(x, vw - w - PAD));
    y = Math.max(PAD, Math.min(y, vh - h - PAD));
    const maxH = side === 'bottom' ? vh - y - PAD : side === 'top' ? a.top - offset - PAD : vh - PAD * 2;
    setState({
      side,
      style: {
        position: 'fixed',
        top: Math.round(y),
        left: Math.round(x),
        ['--_avail-h' as string]: `${Math.max(120, Math.floor(maxH))}px`,
        ['--_anchor-w' as string]: `${a.width}px`,
        ['--_pop-y' as string]: side === 'top' ? '4px' : side === 'bottom' ? '-4px' : '0px',
      },
    });
  }, [anchor, placement, offset, matchWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    if (floatRef.current) ro.observe(floatRef.current);
    if (anchor instanceof Element) ro.observe(anchor);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  }, [open, update, anchor]);

  return { floatRef, style: state.style, side: state.side, update };
}

export interface FloatingProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  anchor: Anchor;
  onClose?: () => void;
  placement?: Placement;
  offset?: number;
  matchWidth?: boolean;
  /** Close when clicking outside (default true). */
  dismissable?: boolean;
}

/** Portal + positioning + dismiss handling. The base of every popup surface. */
export const Floating = forwardRef<HTMLDivElement, FloatingProps>(function Floating(
  { open, anchor, onClose, placement, offset, matchWidth, dismissable = true, className, style, children, ...rest },
  ref,
) {
  const { mounted, closing } = usePresence(open, 100);
  const { floatRef, style: pos, side } = useFloating({ open: mounted, anchor, placement, offset, matchWidth });
  useLayer(open, {
    el: () => floatRef.current,
    anchor: () => (anchor instanceof Element ? anchor : null),
    onEscape: onClose,
    onOutside: dismissable ? onClose : undefined,
  });
  if (!mounted) return null;
  return (
    <Portal>
      <div
        ref={mergeRefs(floatRef, ref)}
        data-side={side}
        data-state={closing ? 'closed' : 'open'}
        className={cx('ui-floating', className)}
        style={{ ...pos, ...style }}
        {...rest}
      >
        {children}
      </div>
    </Portal>
  );
});
