import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx, useControllable } from '../utils';
import './Tabs.css';

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
  variant: TabsVariant;
  size: 'sm' | 'md';
  orientation: 'horizontal' | 'vertical';
}
const TabsContext = createContext<TabsCtx | null>(null);
const useTabs = () => {
  const c = useContext(TabsContext);
  if (!c) throw new Error('Tabs components must be inside <Tabs>');
  return c;
};

export type TabsVariant = 'line' | 'segmented' | 'pills';

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  /** line = underline; segmented = joined buttons (reference design); pills = soft fills. */
  variant?: TabsVariant;
  size?: 'sm' | 'md';
  /** vertical = tab list stacked on the left of the panel (settings-style navigation). */
  orientation?: 'horizontal' | 'vertical';
  children: ReactNode;
  className?: string;
}

/** Tabbed navigation between panels. */
export function Tabs({ value, defaultValue = '', onValueChange, variant = 'line', size = 'md', orientation = 'horizontal', children, className }: TabsProps) {
  const [v, set] = useControllable(value, defaultValue, onValueChange);
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value: v, setValue: set, baseId, variant, size, orientation }}>
      <div className={cx('ui-tabs', className)} data-variant={variant} data-orientation={orientation}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, className, 'aria-label': ariaLabel }: { children: ReactNode; className?: string; 'aria-label'?: string }) {
  const { variant, value, size, orientation } = useTabs();
  const vertical = orientation === 'vertical';
  const ref = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number; top: number; height: number } | null>(null);

  // Sliding indicator under/behind the active tab.
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]');
    if (!el) return setIndicator(null);
    const update = () => setIndicator({ left: el.offsetLeft, width: el.offsetWidth, top: el.offsetTop, height: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  const onKeyDown = (e: KeyboardEvent) => {
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)') ?? []);
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    const [nextKey, prevKey] = vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
    if (e.key === nextKey) next = (i + 1) % tabs.length;
    else if (e.key === prevKey) next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={cx('ui-tablist', className)}
      data-variant={variant}
      data-size={size}
      data-orientation={orientation}
      onKeyDown={onKeyDown}
    >
      {indicator && (
        <span
          className="ui-tablist__indicator"
          style={vertical ? { transform: `translateY(${indicator.top}px)`, height: indicator.height } : { transform: `translateX(${indicator.left}px)`, width: indicator.width }}
          aria-hidden
        />
      )}
      {children}
    </div>
  );
}

export interface TabProps {
  value: string;
  children: ReactNode;
  icon?: ReactNode;
  /** Trailing count / badge. */
  count?: ReactNode;
  disabled?: boolean;
}

export function Tab({ value, children, icon, count, disabled }: TabProps) {
  const ctx = useTabs();
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      className="ui-tab"
      onClick={() => ctx.setValue(value)}
    >
      {icon && <span className="ui-tab__icon">{icon}</span>}
      {children}
      {count != null && <span className="ui-tab__count">{count}</span>}
    </button>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" id={`${ctx.baseId}-panel-${value}`} aria-labelledby={`${ctx.baseId}-tab-${value}`} tabIndex={0} className={cx('ui-tabpanel', className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* SegmentedControl — a value picker that looks like segmented tabs          */
/* ------------------------------------------------------------------------ */

export interface SegmentedOption {
  value: string;
  label?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function SegmentedControl({ options, value, defaultValue, onValueChange, size = 'md', fullWidth, className, ...aria }: SegmentedControlProps) {
  const [v, set] = useControllable(value, defaultValue ?? options[0]?.value ?? '', onValueChange);
  const ref = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked=true]');
    if (!el) return setIndicator(null);
    const update = () => setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [v]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === v);
    const next = enabled[(i + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    set(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked=true]')?.focus());
  };
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cx('ui-tablist ui-segmented', fullWidth && 'ui-segmented--full', className)}
      data-variant="segmented"
      data-size={size}
      onKeyDown={onKeyDown}
    >
      {indicator && <span className="ui-tablist__indicator" style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} aria-hidden />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={v === o.value}
          aria-label={o['aria-label']}
          tabIndex={v === o.value ? 0 : -1}
          disabled={o.disabled}
          className="ui-tab"
          onClick={() => set(o.value)}
        >
          {o.icon && <span className="ui-tab__icon">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
