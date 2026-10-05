import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cx } from '../utils';
import './Feedback.css';

/* ------------------------------------------------------------------------ */
/* Alert                                                                     */
/* ------------------------------------------------------------------------ */

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  icon?: ReactNode | false;
  /** Buttons / links shown under the text. */
  actions?: ReactNode;
  dismissable?: boolean;
  onDismiss?: () => void;
  /** Full-width page banner styling. */
  banner?: boolean;
}

const alertIcons = {
  neutral: <Info />,
  info: <Info />,
  success: <CircleCheck />,
  warning: <TriangleAlert />,
  danger: <CircleAlert />,
};

/** Inline message for contextual feedback. */
export function Alert({ tone = 'neutral', title, icon, actions, dismissable, onDismiss, banner, className, children, ...rest }: AlertProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cx('ui-alert', banner && 'ui-alert--banner', className)}
      data-tone={tone}
      {...rest}
    >
      {icon !== false && <span className="ui-alert__icon">{icon ?? alertIcons[tone]}</span>}
      <div className="ui-alert__content">
        {title && <div className="ui-alert__title">{title}</div>}
        {children && <div className="ui-alert__body">{children}</div>}
        {actions && <div className="ui-alert__actions">{actions}</div>}
      </div>
      {dismissable && (
        <button
          type="button"
          className="ui-control__btn ui-alert__close"
          aria-label="Dismiss"
          onClick={() => {
            setHidden(true);
            onDismiss?.();
          }}
        >
          <X />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Progress                                                                  */
/* ------------------------------------------------------------------------ */

export interface ProgressProps {
  /** 0–100. Omit for indeterminate. */
  value?: number;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  label?: ReactNode;
  /** Show the percentage on the right of the label. */
  showValue?: boolean;
  className?: string;
}

export function Progress({ value, size = 'md', tone = 'neutral', label, showValue, className }: ProgressProps) {
  const pct = value == null ? undefined : Math.max(0, Math.min(100, value));
  return (
    <div className={cx('ui-progress', className)} data-size={size} data-tone={tone}>
      {(label || showValue) && (
        <div className="ui-progress__head">
          <span>{label}</span>
          {showValue && pct != null && <span className="ui-progress__value">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={typeof label === 'string' ? label : undefined}
        data-indeterminate={pct == null || undefined}
      >
        <div className="ui-progress__bar" style={pct != null ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  );
}

export interface ProgressCircleProps {
  value: number;
  size?: number;
  thickness?: number;
  tone?: ProgressProps['tone'];
  /** Content in the middle (defaults to the percentage). */
  children?: ReactNode;
  showValue?: boolean;
}

export function ProgressCircle({ value, size = 48, thickness = 4, tone = 'neutral', showValue = true, children }: ProgressCircleProps) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="ui-progress-circle" data-tone={tone} style={{ width: size, height: size }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={thickness} className="ui-progress-circle__track" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={thickness}
          className="ui-progress-circle__bar"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {(children || showValue) && <span className="ui-progress-circle__label" style={{ fontSize: Math.max(10, size * 0.24) }}>{children ?? `${Math.round(pct)}%`}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Skeleton                                                                  */
/* ------------------------------------------------------------------------ */

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  /** Render N text lines (last one shorter). */
  lines?: number;
}

export function Skeleton({ width, height, circle, lines, className, style, ...rest }: SkeletonProps) {
  if (lines) {
    return (
      <span className="ui-skeleton-lines" aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="ui-skeleton" style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%', height: 10 }} />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cx('ui-skeleton', className)}
      style={{ width, height: height ?? (circle ? width : 12), borderRadius: circle ? '50%' : undefined, ...style }}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Empty state                                                               */
/* ------------------------------------------------------------------------ */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Dashed outline box. */
  bordered?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, actions, bordered, className }: EmptyStateProps) {
  return (
    <div className={cx('ui-empty', bordered && 'ui-empty--bordered', className)}>
      {icon && (
        <div className="ui-empty__art">
          <span className="ui-icon-tile" data-size="lg">
            {icon}
          </span>
        </div>
      )}
      <div className="ui-empty__title">{title}</div>
      {description && <div className="ui-empty__desc">{description}</div>}
      {actions && <div className="ui-empty__actions">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Divider                                                                   */
/* ------------------------------------------------------------------------ */

export function Divider({ orientation = 'horizontal', label, className }: { orientation?: 'horizontal' | 'vertical'; label?: ReactNode; className?: string }) {
  if (label) {
    return (
      <div className={cx('ui-divider ui-divider--label', className)} role="separator">
        <span>{label}</span>
      </div>
    );
  }
  return <div role="separator" aria-orientation={orientation} className={cx('ui-divider', className)} data-orientation={orientation} />;
}
