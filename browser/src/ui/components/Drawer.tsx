import { useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx, Portal, useFocusTrap, useLayer, usePresence, useScrollLock } from '../utils';
import './Drawer.css';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'left' | 'bottom';
  size?: 'sm' | 'md' | 'lg';
  dismissable?: boolean;
  className?: string;
}

/** Edge-anchored panel (sheet) for details, forms and filters. */
export function Drawer({ open, onOpenChange, title, description, children, footer, side = 'right', size = 'md', dismissable = true, className }: DrawerProps) {
  const { mounted, closing } = usePresence(open, 220);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useScrollLock(open);
  useFocusTrap(ref, open);
  useLayer(open, {
    el: () => ref.current,
    onEscape: () => dismissable && onOpenChange(false),
    onOutside: () => dismissable && onOpenChange(false),
  });
  if (!mounted) return null;
  return (
    <Portal>
      <div className="ui-dialog-root" data-state={closing ? 'closed' : 'open'}>
        <div className="ui-backdrop" aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          data-side={side}
          data-size={size}
          className={cx('ui-drawer', className)}
        >
          {title && (
            <header className="ui-drawer__header">
              <div>
                <h2 id={titleId} className="ui-drawer__title">
                  {title}
                </h2>
                {description && <p className="ui-drawer__desc">{description}</p>}
              </div>
              <button type="button" className="ui-control__btn ui-drawer__close" aria-label="Close" data-skip-initial-focus onClick={() => onOpenChange(false)}>
                <X />
              </button>
            </header>
          )}
          <div className="ui-drawer__body">{children}</div>
          {footer && <footer className="ui-drawer__footer">{footer}</footer>}
        </div>
      </div>
    </Portal>
  );
}
