import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../utils';
import { Spinner } from './Spinner';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'accent' | 'danger' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label. */
  leading?: ReactNode;
  /** Icon or element rendered after the label. */
  trailing?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  /** Square button that holds only an icon (pass aria-label!). */
  iconOnly?: boolean;
  /** Pressed / toggled state (for toggle buttons). */
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    leading,
    trailing,
    loading,
    fullWidth,
    iconOnly,
    pressed,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      data-variant={variant}
      data-size={size}
      className={cx('ui-btn', { 'ui-btn--icon': iconOnly, 'ui-btn--full': fullWidth, 'ui-btn--loading': loading }, className)}
      {...rest}
    >
      {loading && <Spinner size={size === 'lg' ? 16 : 14} className="ui-btn__spinner" />}
      {leading && <span className="ui-btn__icon">{leading}</span>}
      {children != null && children !== false && (iconOnly ? children : <span className="ui-btn__label">{children}</span>)}
      {trailing && <span className="ui-btn__icon ui-btn__icon--trailing">{trailing}</span>}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'iconOnly' | 'leading' | 'trailing'> {
  'aria-label': string;
}

/** Square icon-only button. Defaults to the ghost variant. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', ...props },
  ref,
) {
  return <Button ref={ref} variant={variant} iconOnly {...props} />;
});

/** Joins adjacent buttons into one segmented group. */
export function ButtonGroup({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="group" className={cx('ui-btn-group', className)} {...rest}>
      {children}
    </div>
  );
}
