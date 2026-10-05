import { useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx, Portal, useFocusTrap, useLayer, usePresence, useScrollLock } from '../utils';
import { Button, type ButtonVariant } from './Button';
import './Dialog.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Icon badge shown above/beside the title. */
  icon?: ReactNode;
  /** Tone of the icon badge. */
  tone?: 'neutral' | 'danger' | 'success' | 'warning' | 'info';
  children?: ReactNode;
  /** Action row at the bottom (usually Buttons). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Close on backdrop click and Escape (default true). */
  dismissable?: boolean;
  hideClose?: boolean;
  className?: string;
}

/** Modal dialog with focus trap, scroll lock, Escape and backdrop dismissal. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  tone = 'neutral',
  children,
  footer,
  size = 'md',
  dismissable = true,
  hideClose,
  className,
}: DialogProps) {
  const { mounted, closing } = usePresence(open, 160);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useLayer(open, {
    el: () => panelRef.current,
    onEscape: () => dismissable && onOpenChange(false),
    onOutside: () => dismissable && onOpenChange(false),
  });
  if (!mounted) return null;
  return (
    <Portal>
      <div className="ui-dialog-root" data-state={closing ? 'closed' : 'open'}>
        <div className="ui-backdrop" aria-hidden />
        <div className="ui-dialog-viewport">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            data-size={size}
            className={cx('ui-dialog', className)}
          >
            {(title || icon) && (
              <header className="ui-dialog__header">
                {icon && (
                  <span className="ui-dialog__icon" data-tone={tone}>
                    {icon}
                  </span>
                )}
                <div className="ui-dialog__titles">
                  {title && (
                    <h2 id={titleId} className="ui-dialog__title">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id={descId} className="ui-dialog__desc">
                      {description}
                    </p>
                  )}
                </div>
              </header>
            )}
            {children && <div className="ui-dialog__body">{children}</div>}
            {footer && <footer className="ui-dialog__footer">{footer}</footer>}
            {!hideClose && (
              <button type="button" className="ui-dialog__close ui-control__btn" aria-label="Close" data-skip-initial-focus onClick={() => onOpenChange(false)}>
                <X />
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

export interface ConfirmDialogProps extends Omit<DialogProps, 'footer' | 'children'> {
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  /**
   * May return a promise; the confirm button shows a spinner until it settles.
   * The dialog closes when it resolves and stays open if it rejects (report the error yourself).
   */
  onConfirm: () => void | Promise<void>;
}

/** Dialog preset for confirming (often destructive) actions. */
export function ConfirmDialog({
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onOpenChange,
  size = 'sm',
  ...rest
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Keep the dialog open so the user can retry or cancel.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      {...rest}
      size={size}
      onOpenChange={onOpenChange}
      dismissable={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
