import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx, Floating, useControllable, useFocusTrap, type Placement } from '../utils';
import './Popover.css';

export interface PopoverProps {
  trigger: ReactElement<any>;
  children: ReactNode | ((close: () => void) => ReactNode);
  title?: ReactNode;
  description?: ReactNode;
  placement?: Placement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Show a close button in the corner. */
  showClose?: boolean;
  width?: number | string;
  /** Remove inner padding (for custom content like calendars). */
  flush?: boolean;
  className?: string;
}

/** Click-triggered floating panel for rich, interactive content. */
export function Popover({
  trigger,
  children,
  title,
  description,
  placement = 'bottom-start',
  open: openProp,
  onOpenChange,
  showClose,
  width,
  flush,
  className,
}: PopoverProps) {
  const [open, setOpen] = useControllable(openProp, false, onOpenChange);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(panelRef, open);

  const close = () => setOpen(false);
  const t = trigger.props;
  const triggerEl = cloneElement(trigger, {
    ref: setAnchor,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    onClick: (e: React.MouseEvent) => {
      t.onClick?.(e);
      setOpen(!open);
    },
  });

  return (
    <>
      {triggerEl}
      <Floating
        ref={panelRef}
        id={id}
        open={open}
        anchor={anchor}
        onClose={close}
        placement={placement}
        role="dialog"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cx('ui-surface-overlay ui-popover', flush && 'ui-popover--flush', className)}
        style={{ width }}
      >
        {(title || showClose) && (
          <div className="ui-popover__head">
            <div>
              {title && <div className="ui-popover__title">{title}</div>}
              {description && <div className="ui-popover__desc">{description}</div>}
            </div>
            {showClose && (
              <button type="button" className="ui-control__btn" aria-label="Close" onClick={close}>
                <X />
              </button>
            )}
          </div>
        )}
        {typeof children === 'function' ? children(close) : children}
      </Floating>
    </>
  );
}
