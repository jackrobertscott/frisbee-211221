import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx, useControllable } from '../utils';
import { useFieldControl } from './Field';
import './Radio.css';

interface RadioCtx {
  name: string;
  value: string | undefined;
  select: (v: string) => void;
  disabled?: boolean;
  variant: 'default' | 'card';
}
const RadioContext = createContext<RadioCtx | null>(null);

export interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  orientation?: 'vertical' | 'horizontal';
  /** "card" renders each option as a selectable bordered tile. */
  variant?: 'default' | 'card';
  name?: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}

/** Single-choice group with roving focus and arrow-key navigation. */
export function RadioGroup({
  value,
  defaultValue,
  onValueChange,
  disabled,
  orientation = 'vertical',
  variant = 'default',
  name,
  className,
  children,
  ...aria
}: RadioGroupProps) {
  const [current, set] = useControllable<string | undefined>(value, defaultValue, onValueChange as (v: string | undefined) => void);
  const autoName = useId();
  const field = useFieldControl({});
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=radio]:not(:disabled)') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const next = items[(i + dir + items.length) % items.length];
    next?.focus();
    next?.click();
  };

  return (
    <RadioContext.Provider value={{ name: name ?? autoName, value: current, select: set, disabled, variant }}>
      <div
        ref={ref}
        role="radiogroup"
        aria-labelledby={field.labelId}
        aria-label={aria['aria-label']}
        aria-orientation={orientation}
        className={cx('ui-choice-group', `ui-choice-group--${orientation}`, variant === 'card' && 'ui-radio-cards', className)}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export interface RadioProps {
  value: string;
  label?: ReactNode;
  description?: ReactNode;
  /** Icon or media for the card variant. */
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Radio({ value, label, description, icon, disabled: disabledProp, className }: RadioProps) {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('<Radio> must be used inside <RadioGroup>');
  const id = useId();
  const checked = ctx.value === value;
  const disabled = disabledProp || ctx.disabled;
  // Roving tabindex: only the checked radio is tabbable (all are, until one is chosen).

  const control = (
    <button
      type="button"
      role="radio"
      id={id}
      aria-checked={checked}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      tabIndex={checked || ctx.value === undefined ? 0 : -1}
      data-state={checked ? 'checked' : 'unchecked'}
      className="ui-radio"
      onClick={() => ctx.select(value)}
    >
      <span className="ui-radio__dot" />
    </button>
  );

  if (ctx.variant === 'card') {
    return (
      <label
        htmlFor={id}
        className={cx('ui-radio-card', className)}
        data-state={checked ? 'checked' : 'unchecked'}
        data-disabled={disabled || undefined}
      >
        {icon && <span className="ui-radio-card__icon">{icon}</span>}
        <span className="ui-radio-card__text">
          <span className="ui-radio-card__label">{label}</span>
          {description && (
            <span id={`${id}-d`} className="ui-radio-card__desc">
              {description}
            </span>
          )}
        </span>
        {control}
      </label>
    );
  }

  return (
    <div className={cx('ui-check-row', className)} data-disabled={disabled || undefined}>
      {control}
      {(label || description) && (
        <div className="ui-check-row__text">
          <label htmlFor={id} className="ui-check-row__label">
            {label}
          </label>
          {description && (
            <p id={`${id}-d`} className="ui-check-row__desc">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
