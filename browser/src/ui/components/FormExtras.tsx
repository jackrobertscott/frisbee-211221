import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { cx, useControllable } from '../utils';
import { useFieldControl } from './Field';
import type { ControlSize } from './Input';
import './Select.css';
import './FormExtras.css';

/* ------------------------------------------------------------------------ */
/* NumberInput                                                               */
/* ------------------------------------------------------------------------ */

export interface NumberInputProps {
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places to display. */
  precision?: number;
  size?: ControlSize;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  /** Unit or symbol shown inside the field ("kg", "$"). */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** stepper = − value + buttons on both sides; inline = stacked arrows right. */
  variant?: 'stepper' | 'inline';
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/** Numeric field with step buttons, arrow keys, clamping and precision. */
export function NumberInput({
  value,
  defaultValue = null,
  onValueChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision,
  size = 'md',
  disabled,
  invalid,
  placeholder,
  prefix,
  suffix,
  variant = 'stepper',
  id,
  className,
  ...aria
}: NumberInputProps) {
  const field = useFieldControl({ id, invalid, disabled });
  const [num, setNum] = useControllable(value, defaultValue, onValueChange);
  const fmt = (n: number | null) => (n == null ? '' : precision != null ? n.toFixed(precision) : String(n));
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const round = (n: number) => (precision != null ? Number(n.toFixed(precision)) : Number(n.toFixed(10)));

  const commit = (text: string) => {
    setDraft(null);
    if (text.trim() === '') return setNum(null);
    const n = Number(text.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(n)) setNum(round(clamp(n)));
  };
  const bump = (dir: 1 | -1, mult = 1) => {
    const base = num ?? (min > -Infinity ? min : 0);
    setNum(round(clamp(base + dir * step * mult)));
    setDraft(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
    } else if (e.key === 'Enter') commit(e.currentTarget.value);
  };

  const dec = (
    <button type="button" tabIndex={-1} className="ui-number__btn" aria-label="Decrease" disabled={field.disabled || (num != null && num <= min)} onClick={() => bump(-1)}>
      <Minus />
    </button>
  );
  const inc = (
    <button type="button" tabIndex={-1} className="ui-number__btn" aria-label="Increase" disabled={field.disabled || (num != null && num >= max)} onClick={() => bump(1)}>
      <Plus />
    </button>
  );

  return (
    <div className={cx('ui-control ui-number', className)} data-variant={variant} data-size={size} data-invalid={field.invalid || undefined} data-disabled={field.disabled || undefined}>
      {variant === 'stepper' && dec}
      {prefix && <span className="ui-control__icon ui-number__affix ui-number__affix--prefix">{prefix}</span>}
      <input
        id={field.id}
        role="spinbutton"
        inputMode="decimal"
        aria-valuenow={num ?? undefined}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        aria-label={aria['aria-label']}
        disabled={field.disabled}
        placeholder={placeholder}
        className="ui-control__input"
        value={draft ?? fmt(num)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => draft != null && commit(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {suffix && <span className="ui-control__icon ui-number__affix ui-number__affix--suffix">{suffix}</span>}
      {variant === 'stepper' && inc}
      {variant === 'inline' && (
        <span className="ui-number__stack">
          {inc}
          {dec}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* TagInput                                                                  */
/* ------------------------------------------------------------------------ */

export interface TagInputProps {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (v: string[]) => void;
  placeholder?: string;
  /** Return false or a message to reject a tag. */
  validate?: (tag: string) => boolean | string;
  max?: number;
  size?: ControlSize;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
}

/** Free-form token entry (emails, keywords). Enter, comma or paste to add. */
export function TagInput({ value, defaultValue = [], onValueChange, placeholder = 'Add…', validate, max, size = 'md', disabled, invalid, id, className }: TagInputProps) {
  const field = useFieldControl({ id, invalid, disabled });
  const [tags, setTags] = useControllable(value, defaultValue, onValueChange);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string[]) => {
    const next = [...tags];
    for (const r of raw) {
      const t = r.trim();
      if (!t || next.includes(t)) continue;
      if (max && next.length >= max) break;
      const ok = validate ? validate(t) : true;
      if (ok !== true) {
        setError(typeof ok === 'string' ? ok : `“${t}” isn’t valid`);
        return;
      }
      next.push(t);
    }
    setError(null);
    setTags(next);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && text.trim()) {
      e.preventDefault();
      add([text]);
    } else if (e.key === 'Backspace' && !text && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData('text');
    if (/[,\n;]/.test(t)) {
      e.preventDefault();
      add(t.split(/[,\n;]+/));
    }
  };

  return (
    <div className="ui-taginput-wrap">
      <div
        className={cx('ui-control ui-taginput', className)}
        data-size={size}
        data-invalid={field.invalid || !!error || undefined}
        data-disabled={field.disabled || undefined}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {tags.map((t) => (
          <span key={t} className="ui-select__chip">
            {t}
            {!field.disabled && (
              <button type="button" className="ui-select__chip-x" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                <X />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={field.id}
          className="ui-control__input ui-taginput__input"
          value={text}
          placeholder={tags.length ? '' : placeholder}
          disabled={field.disabled || (max != null && tags.length >= max)}
          aria-invalid={field.invalid || !!error || undefined}
          aria-describedby={field.describedBy}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => text.trim() && add([text])}
        />
      </div>
      {error && <p className="ui-field__error">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* PinInput                                                                  */
/* ------------------------------------------------------------------------ */

export interface PinInputProps {
  length?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  /** Fires when every box is filled. */
  onComplete?: (v: string) => void;
  /** Digits only (default) or alphanumeric. */
  type?: 'numeric' | 'alphanumeric';
  mask?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Visual gap after this many boxes (e.g. 3 for "123 456"). */
  groupSize?: number;
  'aria-label'?: string;
}

/** One-time-code entry with auto-advance, backspace, arrows and paste. */
export function PinInput({ length = 6, value, defaultValue = '', onValueChange, onComplete, type = 'numeric', mask, disabled, invalid, groupSize, ...aria }: PinInputProps) {
  const [v, setV] = useControllable(value, defaultValue, onValueChange);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const pattern = type === 'numeric' ? /^\d$/ : /^[a-z0-9]$/i;
  const chars = Array.from({ length }, (_, i) => v[i] ?? '');

  const setAt = (i: number, ch: string) => {
    const arr = [...chars];
    arr[i] = ch;
    const next = arr.join('').slice(0, length);
    setV(next);
    if (next.length === length && !arr.includes('')) onComplete?.(next);
  };
  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  return (
    <div className="ui-pin" role="group" aria-label={aria['aria-label'] ?? 'Verification code'}>
      {chars.map((c, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {groupSize && i > 0 && i % groupSize === 0 && <span className="ui-pin__sep" aria-hidden>–</span>}
          <input
            ref={(n) => {
              refs.current[i] = n;
            }}
            className="ui-pin__box"
            inputMode={type === 'numeric' ? 'numeric' : 'text'}
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            type={mask ? 'password' : 'text'}
            maxLength={1}
            value={c}
            disabled={disabled}
            aria-label={`Character ${i + 1} of ${length}`}
            data-invalid={invalid || undefined}
            data-filled={c ? true : undefined}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const ch = e.target.value.slice(-1);
              if (!ch || !pattern.test(ch)) return;
              setAt(i, type === 'alphanumeric' ? ch.toUpperCase() : ch);
              focus(i + 1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace') {
                e.preventDefault();
                if (c) setAt(i, '');
                else if (i > 0) {
                  setAt(i - 1, '');
                  focus(i - 1);
                }
              } else if (e.key === 'ArrowLeft') focus(i - 1);
              else if (e.key === 'ArrowRight') focus(i + 1);
            }}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData('text').split('').filter((ch) => pattern.test(ch)).join('').slice(0, length - i);
              if (!text) return;
              const arr = [...chars];
              text.split('').forEach((ch, k) => (arr[i + k] = type === 'alphanumeric' ? ch.toUpperCase() : ch));
              const next = arr.join('');
              setV(next);
              focus(i + text.length);
              if (next.length === length && !arr.includes('')) onComplete?.(next);
            }}
          />
        </span>
      ))}
    </div>
  );
}
