import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { cx, Portal, useFloating, type Placement } from '../utils';
import { Kbd } from './Kbd';
import './Tooltip.css';

export interface TooltipProps {
  content: ReactNode;
  /** Shortcut hint shown beside the content. */
  shortcut?: string;
  children: ReactElement<any>;
  placement?: Placement;
  /** Delay before showing, ms. */
  delay?: number;
  disabled?: boolean;
}

// Once one tooltip has shown, neighbours open instantly (skip-delay window).
let lastHidden = 0;

/** Hover/focus hint. Replaces the native `title` attribute. */
export function Tooltip({ content, shortcut, children, placement = 'top', delay = 450, disabled }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef(0);
  const id = useId();
  const { floatRef, style, side } = useFloating({ open, anchor, placement, offset: 6 });

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const show = () => {
    if (disabled) return;
    window.clearTimeout(timer.current);
    const instant = Date.now() - lastHidden < 400;
    timer.current = window.setTimeout(() => setOpen(true), instant ? 0 : delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    if (open) lastHidden = Date.now();
    setOpen(false);
  };

  const p = children.props;
  const child = cloneElement(children, {
    ref: (n: HTMLElement | null) => {
      setAnchor(n);
      const r = (children as any).props.ref;
      if (typeof r === 'function') r(n);
      else if (r) r.current = n;
    },
    'aria-describedby': open ? id : p['aria-describedby'],
    onPointerEnter: (e: React.PointerEvent) => {
      p.onPointerEnter?.(e);
      if (e.pointerType === 'mouse') show();
    },
    onPointerLeave: (e: React.PointerEvent) => {
      p.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: React.PointerEvent) => {
      p.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      p.onFocus?.(e);
      if ((e.target as HTMLElement).matches(':focus-visible')) show();
    },
    onBlur: (e: React.FocusEvent) => {
      p.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {open && (
        <Portal>
          <div
            ref={floatRef as React.RefObject<HTMLDivElement>}
            id={id}
            role="tooltip"
            data-side={side}
            className={cx('ui-tooltip')}
            style={style}
          >
            {content}
            {shortcut && (
              <Kbd size="sm" className="ui-tooltip__kbd">
                {shortcut}
              </Kbd>
            )}
          </div>
        </Portal>
      )}
    </>
  );
}
