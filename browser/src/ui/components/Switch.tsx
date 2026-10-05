import { forwardRef, useId, type ReactNode } from 'react';
import { cx, useControllable } from '../utils';
import './Switch.css';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Put the label on the left and the switch on the far right (settings rows). */
  labelPosition?: 'end' | 'start';
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/** On/off toggle. */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked = false, onCheckedChange, label, description, disabled, size = 'md', labelPosition = 'end', id, className, ...aria },
  ref,
) {
  const [on, set] = useControllable(checked, defaultChecked, onCheckedChange);
  const autoId = useId();
  const controlId = id ?? autoId;
  const control = (
    <button
      ref={ref}
      id={controlId}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={aria['aria-label']}
      aria-describedby={description ? `${controlId}-d` : undefined}
      disabled={disabled}
      data-state={on ? 'checked' : 'unchecked'}
      data-size={size}
      className={cx('ui-switch', !label && className)}
      onClick={() => set(!on)}
    >
      <span className="ui-switch__thumb" />
    </button>
  );
  if (!label) return control;
  return (
    <div
      className={cx('ui-switch-row', `ui-switch-row--${labelPosition}`, className)}
      data-disabled={disabled || undefined}
    >
      {labelPosition === 'end' && control}
      <div className="ui-check-row__text">
        <label htmlFor={controlId} className="ui-check-row__label">
          {label}
        </label>
        {description && (
          <p id={`${controlId}-d`} className="ui-check-row__desc">
            {description}
          </p>
        )}
      </div>
      {labelPosition === 'start' && control}
    </div>
  );
});
