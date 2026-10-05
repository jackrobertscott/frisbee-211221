import { createContext, useContext, useId, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cx } from '../utils';
import './Field.css';

interface FieldContextValue {
  id: string;
  labelId: string;
  descriptionId?: string;
  errorId?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Resolve ids/aria for a control, preferring explicit props over Field context. */
export function useFieldControl(props: { id?: string; invalid?: boolean; disabled?: boolean; required?: boolean }) {
  const ctx = useContext(FieldContext);
  const fallback = useId();
  const id = props.id ?? ctx?.id ?? fallback;
  const describedBy = [ctx?.descriptionId, ctx?.invalid ? ctx?.errorId : undefined].filter(Boolean).join(' ') || undefined;
  return {
    id,
    labelId: ctx?.labelId,
    invalid: props.invalid ?? ctx?.invalid ?? false,
    disabled: props.disabled ?? ctx?.disabled ?? false,
    required: props.required ?? ctx?.required ?? false,
    describedBy,
  };
}

export interface FieldProps {
  label?: ReactNode;
  /** Helper text under the control. */
  description?: ReactNode;
  /** Error message; marks the control invalid when set. */
  error?: ReactNode;
  required?: boolean;
  /** Shows an "Optional" hint next to the label. */
  optional?: boolean;
  disabled?: boolean;
  /** Extra element aligned right of the label (e.g. a link). */
  labelAside?: ReactNode;
  /** Label beside the control instead of above it. */
  orientation?: 'vertical' | 'horizontal';
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Wraps a control with label, description and validation message, wiring up aria. */
export function Field({
  label,
  description,
  error,
  required,
  optional,
  disabled,
  labelAside,
  orientation = 'vertical',
  id: idProp,
  className,
  children,
}: FieldProps) {
  const auto = useId();
  const id = idProp ?? `f${auto}`;
  const ctx: FieldContextValue = {
    id,
    labelId: `${id}-label`,
    descriptionId: description ? `${id}-desc` : undefined,
    errorId: error ? `${id}-err` : undefined,
    invalid: !!error,
    disabled,
    required,
  };
  return (
    <FieldContext.Provider value={ctx}>
      <div className={cx('ui-field', `ui-field--${orientation}`, className)} data-disabled={disabled || undefined}>
        {(label || labelAside) && (
          <div className="ui-field__head">
            {label && (
              <Label id={ctx.labelId} htmlFor={id} required={required} optional={optional}>
                {label}
              </Label>
            )}
            {orientation === 'vertical' && labelAside && <span className="ui-field__aside">{labelAside}</span>}
            {orientation === 'horizontal' && description && (
              <p id={ctx.descriptionId} className="ui-field__desc">
                {description}
              </p>
            )}
          </div>
        )}
        <div className="ui-field__body">
          {children}
          {orientation === 'vertical' && description && !error && (
            <p id={ctx.descriptionId} className="ui-field__desc">
              {description}
            </p>
          )}
          {error && (
            <p id={ctx.errorId} className="ui-field__error" role="alert">
              <CircleAlert size={13} aria-hidden />
              {error}
            </p>
          )}
        </div>
      </div>
    </FieldContext.Provider>
  );
}

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  optional?: boolean;
}

export function Label({ required, optional, className, children, ...rest }: LabelProps) {
  return (
    <label className={cx('ui-label', className)} {...rest}>
      {children}
      {required && (
        <span className="ui-label__req" aria-hidden>
          *
        </span>
      )}
      {optional && <span className="ui-label__opt">Optional</span>}
    </label>
  );
}
