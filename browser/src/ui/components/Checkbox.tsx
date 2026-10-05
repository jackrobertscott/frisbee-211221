import { createContext, forwardRef, useContext, useId, type ReactNode } from 'react';
import { cx, useControllable } from '../utils';
import { useFieldControl } from './Field';
import './Checkbox.css';

export type CheckedState = boolean | 'indeterminate';

export interface CheckboxProps {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md';
  /** Value used when inside a CheckboxGroup. */
  value?: string;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
}

interface GroupCtx {
  value: string[];
  toggle: (v: string, on: boolean) => void;
  disabled?: boolean;
}
const CheckboxGroupContext = createContext<GroupCtx | null>(null);

/** Custom checkbox with indeterminate support, label and description. */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, defaultChecked = false, onCheckedChange, label, description, disabled, invalid, size = 'md', value, id, name, className, ...aria },
  ref,
) {
  const group = useContext(CheckboxGroupContext);
  const field = useFieldControl({ id, invalid, disabled: disabled ?? group?.disabled });
  const autoId = useId();
  // A labelled or grouped checkbox owns its id; a bare one may take its Field's id.
  const controlId = label || group ? (id ?? autoId) : field.id;
  const groupChecked = group && value !== undefined ? group.value.includes(value) : undefined;
  const [state, setState] = useControllable<CheckedState>(groupChecked ?? checked, defaultChecked);
  const descId = description ? `${controlId}-d` : undefined;

  const toggle = () => {
    if (field.disabled) return;
    const next = state === 'indeterminate' ? true : !state;
    if (group && value !== undefined) group.toggle(value, next);
    setState(next);
    onCheckedChange?.(next);
  };

  const box = (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      id={controlId}
      name={name}
      value={value}
      aria-checked={state === 'indeterminate' ? 'mixed' : state}
      aria-invalid={field.invalid || undefined}
      aria-describedby={[descId, field.describedBy].filter(Boolean).join(' ') || undefined}
      aria-label={aria['aria-label']}
      disabled={field.disabled}
      data-state={state === 'indeterminate' ? 'indeterminate' : state ? 'checked' : 'unchecked'}
      data-size={size}
      className={cx('ui-checkbox', !label && className)}
      onClick={toggle}
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        {state === 'indeterminate' ? (
          <path d="M4.5 8h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M4 8.5l2.5 2.5L12 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );

  if (!label) return box;
  return (
    <div className={cx('ui-check-row', className)} data-disabled={field.disabled || undefined} data-size={size}>
      {box}
      <div className="ui-check-row__text">
        <label htmlFor={controlId} className="ui-check-row__label">
          {label}
        </label>
        {description && (
          <p id={descId} className="ui-check-row__desc">
            {description}
          </p>
        )}
      </div>
    </div>
  );
});

export interface CheckboxGroupProps {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  disabled?: boolean;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}

/** Group of checkboxes whose values are collected into a string array. */
export function CheckboxGroup({ value, defaultValue = [], onValueChange, disabled, orientation = 'vertical', className, children, ...aria }: CheckboxGroupProps) {
  const [current, set] = useControllable(value, defaultValue, onValueChange);
  const field = useFieldControl({});
  return (
    <CheckboxGroupContext.Provider
      value={{
        value: current,
        disabled,
        toggle: (v, on) => set(on ? [...current.filter((x) => x !== v), v] : current.filter((x) => x !== v)),
      }}
    >
      <div
        role="group"
        aria-labelledby={field.labelId}
        aria-label={aria['aria-label']}
        className={cx('ui-choice-group', `ui-choice-group--${orientation}`, className)}
      >
        {children}
      </div>
    </CheckboxGroupContext.Provider>
  );
}
