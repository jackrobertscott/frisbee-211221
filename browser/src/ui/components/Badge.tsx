import type { HTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../utils';
import './Badge.css';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** soft = tinted fill, outline = bordered, solid = strong fill. */
  variant?: 'soft' | 'outline' | 'solid';
  size?: 'sm' | 'md';
  /** Leading status dot. */
  dot?: boolean;
  icon?: ReactNode;
}

/** Compact status / metadata label. */
export function Badge({ tone = 'neutral', variant = 'soft', size = 'md', dot, icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx('ui-badge', className)} data-tone={tone} data-variant={variant} data-size={size} {...rest}>
      {dot && <span className="ui-badge__dot" aria-hidden />}
      {icon && <span className="ui-badge__icon">{icon}</span>}
      {children}
    </span>
  );
}

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: ReactNode;
  /** Shows a remove button. */
  onRemove?: () => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

/** Neutral, optionally removable token (filters, tags, recipients). */
export function Tag({ icon, onRemove, size = 'md', disabled, className, children, ...rest }: TagProps) {
  return (
    <span className={cx('ui-tag', className)} data-size={size} data-disabled={disabled || undefined} {...rest}>
      {icon && <span className="ui-tag__icon">{icon}</span>}
      <span className="ui-tag__label">{children}</span>
      {onRemove && (
        <button type="button" className="ui-tag__x" aria-label={`Remove ${typeof children === 'string' ? children : ''}`} onClick={onRemove} disabled={disabled}>
          <X />
        </button>
      )}
    </span>
  );
}
