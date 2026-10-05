import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { cx, mergeRefs } from '../utils';
import { useFieldControl } from './Field';
import { Kbd } from './Kbd';
import './Input.css';

export type ControlSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: ControlSize;
  /** Icon inside the field, before the text. */
  leading?: ReactNode;
  /** Icon/element inside the field, after the text. */
  trailing?: ReactNode;
  /** Attached segment before the field, e.g. "https://". */
  startAddon?: ReactNode;
  /** Attached segment after the field, e.g. ".com". */
  endAddon?: ReactNode;
  invalid?: boolean;
  /** Show a clear button when there is a value. */
  clearable?: boolean;
  onClear?: () => void;
  className?: string;
  inputClassName?: string;
}

/** Single-line text field. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = 'md',
    leading,
    trailing,
    startAddon,
    endAddon,
    invalid,
    clearable,
    onClear,
    className,
    inputClassName,
    disabled,
    required,
    readOnly,
    id,
    type = 'text',
    ...rest
  },
  ref,
) {
  const field = useFieldControl({ id, invalid, disabled, required });
  const inner = useRef<HTMLInputElement>(null);
  const [reveal, setReveal] = useState(false);
  const [hasValue, setHasValue] = useState(!!(rest.value ?? rest.defaultValue));
  const value = rest.value;
  useLayoutEffect(() => {
    if (value !== undefined) setHasValue(String(value).length > 0);
  }, [value]);

  const isPassword = type === 'password';
  const clear = () => {
    const el = inner.current;
    if (!el) return;
    // Set through the native setter so React's onChange fires for controlled inputs.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setHasValue(false);
    onClear?.();
    el.focus();
  };

  return (
    <div
      className={cx('ui-control', className)}
      data-size={size}
      data-invalid={field.invalid || undefined}
      data-disabled={field.disabled || undefined}
      data-readonly={readOnly || undefined}
      onMouseDown={(e) => {
        if (e.target !== inner.current && !(e.target as Element).closest('button')) {
          e.preventDefault();
          inner.current?.focus();
        }
      }}
    >
      {startAddon && <span className="ui-control__addon">{startAddon}</span>}
      {leading && <span className="ui-control__icon">{leading}</span>}
      <input
        ref={mergeRefs(inner, ref)}
        id={field.id}
        type={isPassword && reveal ? 'text' : type}
        disabled={field.disabled}
        required={field.required}
        readOnly={readOnly}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        className={cx('ui-control__input', inputClassName)}
        {...rest}
        onChange={(e) => {
          setHasValue(e.target.value.length > 0);
          rest.onChange?.(e);
        }}
      />
      {clearable && hasValue && !field.disabled && !readOnly && (
        <button type="button" className="ui-control__btn" aria-label="Clear" onClick={clear} tabIndex={-1}>
          <X />
        </button>
      )}
      {isPassword && (
        <button
          type="button"
          className="ui-control__btn"
          aria-label={reveal ? 'Hide password' : 'Show password'}
          onClick={() => setReveal((r) => !r)}
        >
          {reveal ? <EyeOff /> : <Eye />}
        </button>
      )}
      {trailing && <span className="ui-control__icon">{trailing}</span>}
      {endAddon && <span className="ui-control__addon">{endAddon}</span>}
    </div>
  );
});

export interface SearchInputProps extends Omit<InputProps, 'leading' | 'type'> {
  /** Keyboard shortcut hint shown on the right, e.g. "⌘K". */
  shortcut?: string;
}

/** Text field preset for search, with icon, clear button and optional shortcut hint. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { shortcut, placeholder = 'Search', clearable = true, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="search"
      role="searchbox"
      leading={<Search />}
      placeholder={placeholder}
      clearable={clearable}
      trailing={shortcut ? <Kbd size="sm">{shortcut}</Kbd> : undefined}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Grow with content up to maxRows. */
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
  /** Show a live character count (uses maxLength when given). */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoResize, minRows = 3, maxRows = 12, showCount, className, disabled, required, id, ...rest },
  ref,
) {
  const field = useFieldControl({ id, invalid, disabled, required });
  const inner = useRef<HTMLTextAreaElement>(null);
  const [count, setCount] = useState(String(rest.value ?? rest.defaultValue ?? '').length);

  const resize = () => {
    const el = inner.current;
    if (!el || !autoResize) return;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 20;
    const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    el.style.height = 'auto';
    const borders = el.offsetHeight - el.clientHeight;
    const content = el.scrollHeight - padding;
    const lines = Math.min(Math.max(content, lh * minRows), lh * maxRows);
    el.style.height = `${lines + padding + borders}px`;
  };
  useLayoutEffect(resize, [rest.value, autoResize]);

  return (
    <div className={cx('ui-textarea', className)}>
      <textarea
        ref={mergeRefs(inner, ref)}
        id={field.id}
        rows={minRows}
        disabled={field.disabled}
        required={field.required}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        data-invalid={field.invalid || undefined}
        className="ui-textarea__el"
        {...rest}
        onChange={(e) => {
          setCount(e.target.value.length);
          resize();
          rest.onChange?.(e);
        }}
      />
      {showCount && (
        <span className="ui-textarea__count" aria-live="polite">
          {count}
          {rest.maxLength ? ` / ${rest.maxLength}` : ''}
        </span>
      )}
    </div>
  );
});
