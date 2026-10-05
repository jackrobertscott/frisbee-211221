import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cx, Floating, useControllable } from '../utils';
import { useFieldControl } from './Field';
import { Button } from './Button';
import type { ControlSize } from './Input';
import './DatePicker.css';

/* ------------------------------------------------------------------------ */
/* Date helpers                                                              */
/* ------------------------------------------------------------------------ */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const days = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  return new Date(r.getFullYear(), r.getMonth(), Math.min(d.getDate(), days));
};
const sameDay = (a?: Date | null, b?: Date | null) => !!a && !!b && a.toDateString() === b.toDateString();
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const between = (d: Date, a: Date, b: Date) => d > (a < b ? a : b) && d < (a < b ? b : a);

export const formatDate = (d: Date | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  d ? new Intl.DateTimeFormat(undefined, opts).format(d) : '';

export type DateRange = { start: Date | null; end: Date | null };

/* ------------------------------------------------------------------------ */
/* Calendar                                                                  */
/* ------------------------------------------------------------------------ */

interface CalendarBase {
  min?: Date;
  max?: Date;
  isDateDisabled?: (d: Date) => boolean;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn?: 0 | 1;
  /** Number of months side by side. */
  months?: 1 | 2;
  /** Move focus to the selected/today cell on mount (used inside pickers). */
  autoFocus?: boolean;
  className?: string;
}

export interface CalendarProps extends CalendarBase {
  mode?: 'single';
  value?: Date | null;
  defaultValue?: Date | null;
  onValueChange?: (d: Date | null) => void;
}

export interface RangeCalendarProps extends CalendarBase {
  mode: 'range';
  value?: DateRange;
  defaultValue?: DateRange;
  onValueChange?: (r: DateRange) => void;
}

/** Month grid with keyboard navigation; single date or range selection. */
export function Calendar(props: CalendarProps | RangeCalendarProps) {
  const { min, max, isDateDisabled, weekStartsOn = 1, months = 1, autoFocus, className } = props;
  const isRange = props.mode === 'range';
  const [single, setSingle] = useControllable<Date | null>(
    !isRange ? (props as CalendarProps).value : undefined,
    !isRange ? ((props as CalendarProps).defaultValue ?? null) : null,
    !isRange ? (props as CalendarProps).onValueChange : undefined,
  );
  const [range, setRange] = useControllable<DateRange>(
    isRange ? (props as RangeCalendarProps).value : undefined,
    isRange ? ((props as RangeCalendarProps).defaultValue ?? { start: null, end: null }) : { start: null, end: null },
    isRange ? (props as RangeCalendarProps).onValueChange : undefined,
  );
  const initial = (isRange ? range.start : single) ?? startOfDay(new Date());
  const [focused, setFocused] = useState<Date>(initial);
  const [view, setView] = useState<Date>(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [hover, setHover] = useState<Date | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());
  const shouldFocus = useRef(!!autoFocus);

  const disabled = (d: Date) => (min && d < startOfDay(min)) || (max && d > startOfDay(max)) || !!isDateDisabled?.(d);

  // Keep the focused day visible.
  useEffect(() => {
    const last = addMonths(view, months - 1);
    if (focused < view || focused > new Date(last.getFullYear(), last.getMonth() + 1, 0)) setView(new Date(focused.getFullYear(), focused.getMonth(), 1));
    if (shouldFocus.current) {
      shouldFocus.current = false;
      requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>('[data-focused]')?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const shiftMonth = (n: number) => {
    setView(addMonths(view, n));
    setFocused(addMonths(focused, n));
  };

  const select = (d: Date) => {
    if (disabled(d)) return;
    setFocused(d);
    if (!isRange) return setSingle(d);
    if (!range.start || range.end) setRange({ start: d, end: null });
    else if (d < range.start) setRange({ start: d, end: range.start });
    else setRange({ start: range.start, end: d });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, e.shiftKey ? 12 : 1),
      Home: () => addDays(focused, -((focused.getDay() - weekStartsOn + 7) % 7)),
      End: () => addDays(focused, 6 - ((focused.getDay() - weekStartsOn + 7) % 7)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      shouldFocus.current = true;
      setFocused(moves[e.key]());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(focused);
    }
  };

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 7 + weekStartsOn); // a Sunday + offset
    return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(addDays(base, i)).slice(0, 2));
  }, [weekStartsOn]);

  const renderMonth = (month: Date, idx: number) => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() - weekStartsOn + 7) % 7;
    const start = addDays(first, -offset);
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const rangeEnd = range.end ?? (range.start && hover ? hover : null);
    return (
      <div className="ui-cal__month" key={idx}>
        <div className="ui-cal__head">
          {idx === 0 ? (
            <button type="button" className="ui-control__btn ui-cal__nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <ChevronLeft />
            </button>
          ) : (
            <span className="ui-cal__nav" />
          )}
          <div className="ui-cal__title" aria-live="polite">
            {formatDate(month, { month: 'long', year: 'numeric' })}
          </div>
          {idx === months - 1 ? (
            <button type="button" className="ui-control__btn ui-cal__nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <ChevronRight />
            </button>
          ) : (
            <span className="ui-cal__nav" />
          )}
        </div>
        <div role="grid" className="ui-cal__grid" onKeyDown={onKeyDown} onPointerLeave={() => setHover(null)}>
          <div role="row" className="ui-cal__row">
            {weekdays.map((w) => (
              <span role="columnheader" key={w} className="ui-cal__wd">
                {w}
              </span>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, r) => (
            <div role="row" className="ui-cal__row" key={r}>
              {days.slice(r * 7, r * 7 + 7).map((d) => {
                const outside = !sameMonth(d, month);
                const isSel = isRange ? sameDay(d, range.start) || sameDay(d, range.end) : sameDay(d, single);
                const inRange = isRange && range.start && rangeEnd && between(d, range.start, rangeEnd);
                const isStart = isRange && range.start && rangeEnd && sameDay(d, range.start < rangeEnd ? range.start : rangeEnd);
                const isEnd = isRange && range.start && rangeEnd && sameDay(d, range.start < rangeEnd ? rangeEnd : range.start);
                const isFocused = sameDay(d, focused) && !outside;
                if (outside && months > 1) return <span key={d.toISOString()} className="ui-cal__cell" />;
                return (
                  <span role="gridcell" key={d.toISOString()} className="ui-cal__cell" data-in-range={inRange || undefined} data-range-start={isStart || undefined} data-range-end={isEnd || undefined} data-month-first={d.getDate() === 1 || undefined} data-month-last={sameDay(addDays(d, 1), new Date(d.getFullYear(), d.getMonth() + 1, 1)) || undefined}>
                    <button
                      type="button"
                      tabIndex={isFocused ? 0 : -1}
                      className="ui-cal__day"
                      aria-selected={isSel || undefined}
                      aria-current={sameDay(d, today) ? 'date' : undefined}
                      aria-label={formatDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      disabled={disabled(d)}
                      data-outside={outside || undefined}
                      data-focused={isFocused || undefined}
                      onClick={() => select(d)}
                      onPointerEnter={() => isRange && setHover(d)}
                    >
                      {d.getDate()}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div ref={gridRef} className={cx('ui-cal', className)} data-months={months}>
      {Array.from({ length: months }, (_, i) => renderMonth(addMonths(view, i), i))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* DatePicker                                                                */
/* ------------------------------------------------------------------------ */

interface PickerBase {
  placeholder?: string;
  size?: ControlSize;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  min?: Date;
  max?: Date;
  isDateDisabled?: (d: Date) => boolean;
  format?: (d: Date) => string;
  id?: string;
  className?: string;
}

export interface DatePickerProps extends PickerBase {
  value?: Date | null;
  defaultValue?: Date | null;
  onValueChange?: (d: Date | null) => void;
}

/** Date field opening a calendar popover. */
export function DatePicker({ value, defaultValue = null, onValueChange, placeholder = 'Pick a date', size = 'md', disabled, invalid, clearable, min, max, isDateDisabled, format = (d) => formatDate(d), id, className }: DatePickerProps) {
  const field = useFieldControl({ id, invalid, disabled });
  const [date, setDate] = useControllable(value, defaultValue, onValueChange);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <PickerTrigger
        ref={setAnchor}
        id={field.id}
        open={open}
        onToggle={() => setOpen(!open)}
        size={size}
        field={field}
        className={className}
        label={date ? format(date) : null}
        placeholder={placeholder}
        onClear={clearable && date ? () => setDate(null) : undefined}
      />
      <Floating open={open} anchor={anchor} onClose={() => setOpen(false)} className="ui-surface-overlay ui-datepicker" role="dialog" aria-label="Choose date">
        <Calendar
          autoFocus
          value={date}
          onValueChange={(d) => {
            setDate(d);
            setOpen(false);
            anchor?.focus();
          }}
          min={min}
          max={max}
          isDateDisabled={isDateDisabled}
        />
        <div className="ui-datepicker__foot">
          <Button size="xs" variant="ghost" onClick={() => { setDate(startOfDay(new Date())); setOpen(false); }}>
            Today
          </Button>
        </div>
      </Floating>
    </>
  );
}

export interface DateRangePickerProps extends PickerBase {
  value?: DateRange;
  defaultValue?: DateRange;
  onValueChange?: (r: DateRange) => void;
  /** Quick ranges shown in a side column. */
  presets?: { label: string; range: () => DateRange }[];
}

export const defaultRangePresets: DateRangePickerProps['presets'] = [
  { label: 'Today', range: () => ({ start: startOfDay(new Date()), end: startOfDay(new Date()) }) },
  { label: 'Last 7 days', range: () => ({ start: addDays(startOfDay(new Date()), -6), end: startOfDay(new Date()) }) },
  { label: 'Last 30 days', range: () => ({ start: addDays(startOfDay(new Date()), -29), end: startOfDay(new Date()) }) },
  { label: 'This month', range: () => ({ start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), end: startOfDay(new Date()) }) },
  { label: 'Last month', range: () => ({ start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), end: new Date(new Date().getFullYear(), new Date().getMonth(), 0) }) },
  { label: 'This year', range: () => ({ start: new Date(new Date().getFullYear(), 0, 1), end: startOfDay(new Date()) }) },
];

/** Two-month range picker with presets and apply/cancel. */
export function DateRangePicker({ value, defaultValue = { start: null, end: null }, onValueChange, placeholder = 'Select dates', size = 'md', disabled, invalid, clearable, min, max, isDateDisabled, format = (d) => formatDate(d), presets = defaultRangePresets, id, className }: DateRangePickerProps) {
  const field = useFieldControl({ id, invalid, disabled });
  const [range, setRange] = useControllable(value, defaultValue, onValueChange);
  const [draft, setDraft] = useState<DateRange>(range);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [calKey, setCalKey] = useState(0);
  const label = range.start ? `${format(range.start)} – ${range.end ? format(range.end) : '…'}` : null;
  return (
    <>
      <PickerTrigger
        ref={setAnchor}
        id={field.id}
        open={open}
        onToggle={() => {
          setDraft(range);
          setOpen(!open);
        }}
        size={size}
        field={field}
        className={className}
        label={label}
        placeholder={placeholder}
        onClear={clearable && range.start ? () => setRange({ start: null, end: null }) : undefined}
      />
      <Floating open={open} anchor={anchor} onClose={() => setOpen(false)} className="ui-surface-overlay ui-datepicker ui-datepicker--range" role="dialog" aria-label="Choose date range">
        <div className="ui-datepicker__layout">
          {presets && presets.length > 0 && (
            <div className="ui-datepicker__presets">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="ui-datepicker__preset"
                  onClick={() => {
                    setDraft(p.range());
                    setCalKey((k) => k + 1);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div>
            <Calendar key={calKey} autoFocus mode="range" months={2} value={draft} onValueChange={setDraft} min={min} max={max} isDateDisabled={isDateDisabled} />
            <div className="ui-datepicker__foot">
              <span className="ui-datepicker__summary">{draft.start ? `${format(draft.start)} – ${draft.end ? format(draft.end) : '…'}` : 'No dates selected'}</span>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!draft.start || !draft.end}
                onClick={() => {
                  setRange(draft);
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </Floating>
    </>
  );
}


interface TriggerProps {
  id: string;
  open: boolean;
  onToggle: () => void;
  size: ControlSize;
  field: ReturnType<typeof useFieldControl>;
  label: ReactNode | null;
  placeholder: string;
  onClear?: () => void;
  className?: string;
}

const PickerTrigger = forwardRef<HTMLButtonElement, TriggerProps>(function PickerTrigger({ id, open, onToggle, size, field, label, placeholder, onClear, className }, ref) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-labelledby={field.labelId ? `${field.labelId} ${id}` : undefined}
      aria-describedby={field.describedBy}
      disabled={field.disabled}
      data-size={size}
      data-invalid={field.invalid || undefined}
      data-disabled={field.disabled || undefined}
      className={cx('ui-control', className)}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!open) onToggle();
        }
      }}
    >
      <CalendarDays size={16} className="ui-control__icon" aria-hidden />
      <span className="ui-control__value">{label ?? <span className="ui-control__placeholder">{placeholder}</span>}</span>
      {onClear && (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Clear date"
          className="ui-control__btn"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          <X />
        </span>
      )}
    </button>
  );
});
