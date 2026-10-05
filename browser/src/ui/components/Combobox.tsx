import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cx, Floating, useControllable, useListNavigation } from '../utils';
import { useFieldControl } from './Field';
import { Listbox, optionId, type Option } from './Listbox';
import type { ControlSize } from './Input';
import { Spinner } from './Spinner';
import './Select.css';

export interface ComboboxProps {
  options: Option[];
  /** Selected option value. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  /** Fires as the user types (use for async search). */
  onInputChange?: (text: string) => void;
  /** Custom filter; defaults to case-insensitive "includes". Pass `false` to disable (server filtering). */
  filter?: ((option: Option, query: string) => boolean) | false;
  /** Allow committing text that isn't in the list. */
  allowCustomValue?: boolean;
  placeholder?: string;
  size?: ControlSize;
  leading?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  emptyText?: ReactNode;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

const defaultFilter = (o: Option, q: string) => o.label.toLowerCase().includes(q.toLowerCase());

/** Text input with an autocomplete list. */
export function Combobox({
  options,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  onInputChange,
  filter = defaultFilter,
  allowCustomValue,
  placeholder,
  size = 'md',
  leading,
  loading,
  disabled,
  invalid,
  emptyText,
  id,
  className,
  ...aria
}: ComboboxProps) {
  const field = useFieldControl({ id, invalid, disabled });
  const listId = useId();
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  const labelOf = useCallback((v: string | null) => (v == null ? '' : (options.find((o) => o.value === v)?.label ?? v)), [options]);
  const [text, setText] = useState(() => labelOf(value));
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => (filter && dirty && text ? options.filter((o) => filter(o, text)) : options),
    [options, filter, text, dirty],
  );
  const nav = useListNavigation({ count: filtered.length, isDisabled: (i) => !!filtered[i]?.disabled });

  const commit = (o: Option | null) => {
    setValue(o?.value ?? null);
    setText(o?.label ?? '');
    setDirty(false);
    setOpen(false);
  };

  const revert = () => {
    if (allowCustomValue && text && dirty) {
      setValue(text);
    } else {
      setText(labelOf(value));
    }
    setDirty(false);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
      nav.setActive(nav.first());
      return;
    }
    if (open && nav.handleKey(e.key)) {
      if (e.key === 'Home' || e.key === 'End') return; // let caret move in the text
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault();
      const o = filtered[nav.active];
      if (o) commit(o);
      else if (allowCustomValue) revert();
    }
  };

  return (
    <>
      <div
        ref={(n) => {
          wrapRef.current = n;
          setAnchor(n);
        }}
        className={cx('ui-control', className)}
        data-size={size}
        data-invalid={field.invalid || undefined}
        data-disabled={field.disabled || undefined}
        data-focused={open || undefined}
      >
        {leading && <span className="ui-control__icon">{leading}</span>}
        <input
          ref={inputRef}
          id={field.id}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && nav.active >= 0 ? optionId(listId, nav.active) : undefined}
          aria-describedby={field.describedBy}
          aria-invalid={field.invalid || undefined}
          aria-label={aria['aria-label']}
          autoComplete="off"
          disabled={field.disabled}
          placeholder={placeholder}
          className="ui-control__input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
            setOpen(true);
            nav.setActive(0);
            onInputChange?.(e.target.value);
          }}
          onFocus={() => inputRef.current?.select()}
          onClick={() => setOpen(true)}
          onBlur={() => open && revert()}
          onKeyDown={onKeyDown}
        />
        {loading && <Spinner size={14} className="ui-control__icon" />}
        {text && !field.disabled && (
          <button
            type="button"
            tabIndex={-1}
            className="ui-control__btn"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              commit(null);
              onInputChange?.('');
              inputRef.current?.focus();
            }}
          >
            <X />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          className="ui-control__btn"
          aria-label="Show options"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown className="ui-control__chevron" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      <Floating open={open} anchor={anchor} onClose={revert} matchWidth className="ui-surface-overlay ui-select__popup">
        <Listbox
          id={listId}
          options={filtered}
          active={nav.active}
          isSelected={(o) => o.value === value}
          onSelect={(o) => commit(o)}
          onHover={nav.setActive}
          emptyText={loading ? 'Searching…' : (emptyText ?? (allowCustomValue && text ? `Use “${text}”` : 'No matches'))}
          highlight={dirty ? text : undefined}
        />
      </Floating>
    </>
  );
}
