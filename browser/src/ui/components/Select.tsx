import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cx, Floating, mergeRefs, useControllable, useListNavigation, useTypeahead } from '../utils';
import { useFieldControl } from './Field';
import { Listbox, optionId, type Option } from './Listbox';
import type { ControlSize } from './Input';
import './Select.css';

export type { Option } from './Listbox';

interface BaseSelectProps {
  options: Option[];
  placeholder?: string;
  size?: ControlSize;
  disabled?: boolean;
  invalid?: boolean;
  /** Adds a search box to filter long option lists. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Show a × button to reset the value. */
  clearable?: boolean;
  /** Icon shown at the start of the trigger. */
  leading?: ReactNode;
  emptyText?: ReactNode;
  id?: string;
  className?: string;
  /** Minimum popup width (defaults to trigger width). */
  popupWidth?: number;
  'aria-label'?: string;
}

export interface SelectProps extends BaseSelectProps {
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  /** Custom rendering of the selected option in the trigger. */
  renderValue?: (option: Option) => ReactNode;
}

export interface MultiSelectProps extends BaseSelectProps {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Collapse chips beyond this count into "+N". */
  maxChips?: number;
}

/** Single-value select with keyboard navigation, typeahead, search and groups. */
export function Select(props: SelectProps) {
  const [value, setValue] = useControllable<string | null>(props.value, props.defaultValue ?? null, props.onValueChange);
  return (
    <SelectImpl
      {...props}
      multiple={false}
      selected={value == null ? [] : [value]}
      onToggle={(v, close) => {
        setValue(v);
        close();
      }}
      onClear={() => setValue(null)}
    />
  );
}

/** Multi-value select rendering selections as removable chips. */
export function MultiSelect(props: MultiSelectProps) {
  const [value, setValue] = useControllable<string[]>(props.value, props.defaultValue ?? [], props.onValueChange);
  return (
    <SelectImpl
      {...props}
      renderValue={undefined}
      multiple
      selected={value}
      onToggle={(v) => setValue(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
      onRemove={(v) => setValue(value.filter((x) => x !== v))}
      onClear={() => setValue([])}
    />
  );
}

interface ImplProps extends BaseSelectProps {
  multiple: boolean;
  selected: string[];
  onToggle: (value: string, close: () => void) => void;
  onRemove?: (value: string) => void;
  onClear: () => void;
  renderValue?: (option: Option) => ReactNode;
  maxChips?: number;
}

function SelectImpl({
  options,
  placeholder = 'Select…',
  size = 'md',
  disabled,
  invalid,
  searchable,
  searchPlaceholder = 'Search…',
  clearable,
  leading,
  emptyText,
  id,
  className,
  popupWidth,
  multiple,
  selected,
  onToggle,
  onRemove,
  onClear,
  renderValue,
  maxChips = 3,
  ...aria
}: ImplProps) {
  const field = useFieldControl({ id, invalid, disabled });
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const isDisabled = useCallback((i: number) => !!filtered[i]?.disabled, [filtered]);
  const nav = useListNavigation({ count: filtered.length, isDisabled });
  const typeahead = useTypeahead(
    useCallback((i) => filtered[i].label, [filtered]),
    filtered.length,
    nav.setActive,
  );

  const selectedOptions = selected.map((v) => options.find((o) => o.value === v)).filter(Boolean) as Option[];

  const openMenu = () => {
    if (field.disabled) return;
    setQuery('');
    const idx = options.findIndex((o) => o.value === selected[0]);
    nav.setActive(idx >= 0 ? idx : nav.first());
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (open && searchable) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, searchable]);

  // Reset the highlighted option to the first match as the query changes.
  useEffect(() => {
    if (open && searchable) nav.setActive(filtered.findIndex((o) => !o.disabled));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const commit = (i: number) => {
    const o = filtered[i];
    if (!o || o.disabled) return;
    onToggle(o.value, close);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (nav.handleKey(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' || (e.key === ' ' && !searchable)) {
      e.preventDefault();
      commit(nav.active);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (!searchable && typeahead(e.key, nav.active)) {
      e.preventDefault();
    }
  };

  const hasValue = selectedOptions.length > 0;
  const visibleChips = selectedOptions.slice(0, maxChips);
  const hiddenCount = selectedOptions.length - visibleChips.length;

  return (
    <>
      <button
        ref={mergeRefs(triggerRef, setAnchor)}
        id={field.id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !searchable && nav.active >= 0 ? optionId(listId, nav.active) : undefined}
        aria-labelledby={field.labelId}
        aria-label={aria['aria-label']}
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid || undefined}
        disabled={field.disabled}
        data-size={size}
        data-invalid={field.invalid || undefined}
        data-disabled={field.disabled || undefined}
        className={cx('ui-control ui-select', multiple && hasValue && 'ui-select--chips', className)}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {leading && <span className="ui-control__icon">{leading}</span>}
        <span className="ui-control__value">
          {!hasValue && <span className="ui-control__placeholder">{placeholder}</span>}
          {hasValue && !multiple && (renderValue ? renderValue(selectedOptions[0]) : <SingleValue option={selectedOptions[0]} />)}
          {hasValue && multiple && (
            <span className="ui-select__chips">
              {visibleChips.map((o) => (
                <span key={o.value} className="ui-select__chip">
                  {o.label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${o.label}`}
                    className="ui-select__chip-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove?.(o.value);
                    }}
                  >
                    <X />
                  </span>
                </span>
              ))}
              {hiddenCount > 0 && <span className="ui-select__chip ui-select__chip--more">+{hiddenCount}</span>}
            </span>
          )}
        </span>
        {clearable && hasValue && !field.disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            className="ui-control__btn"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X />
          </span>
        )}
        <ChevronDown size={16} className="ui-control__chevron" aria-hidden />
      </button>

      <Floating
        open={open}
        anchor={anchor}
        onClose={close}
        matchWidth
        className="ui-surface-overlay ui-select__popup"
        style={popupWidth ? { minWidth: popupWidth } : undefined}
      >
        {searchable && (
          <div className="ui-select__search">
            <Search size={15} aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={nav.active >= 0 ? optionId(listId, nav.active) : undefined}
              className="ui-select__search-input"
            />
          </div>
        )}
        <Listbox
          id={listId}
          options={filtered}
          active={nav.active}
          multiple={multiple}
          isSelected={(o) => selected.includes(o.value)}
          onSelect={(_, i) => commit(i)}
          onHover={nav.setActive}
          emptyText={emptyText}
          highlight={query}
          labelledBy={field.labelId}
        />
      </Floating>
    </>
  );
}

function SingleValue({ option }: { option: Option }) {
  return (
    <>
      {option.icon && <span className="ui-select__value-icon">{option.icon}</span>}
      <span className="ui-select__value-text">{option.label}</span>
    </>
  );
}
