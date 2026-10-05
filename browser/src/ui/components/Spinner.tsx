import { cx } from '../utils';
import './Spinner.css';

export interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/** Indeterminate loading indicator. Inherits `currentColor`. */
export function Spinner({ size = 16, className, label = 'Loading' }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      className={cx('ui-spinner', className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.75" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
