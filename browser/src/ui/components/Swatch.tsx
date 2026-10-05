import { useRef, type HTMLAttributes, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { cx, useControllable } from '../utils';
import { useFieldControl } from './Field';
import './Swatch.css';

/** Perceived lightness of a hex colour (0–1), used to pick a legible check colour. */
export function colorLuminance(hex: string) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return 0.5;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export interface SwatchProps extends HTMLAttributes<HTMLSpanElement> {
  /** Any CSS colour. */
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  shape?: 'square' | 'circle';
}

/** A small, bordered chip of colour — for legends, tags and data-coloured entities. */
export function Swatch({ color, size = 'sm', shape = 'square', className, style, ...rest }: SwatchProps) {
  return <span className={cx('ui-swatch', className)} data-size={size} data-shape={shape} style={{ ...style, '--_c': color } as React.CSSProperties} aria-hidden {...rest} />;
}

export interface SwatchPickerProps {
  /** Hex colours to choose from. */
  colors: string[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (color: string) => void;
  size?: 'sm' | 'md' | 'lg';
  /** Accessible names for colours (defaults to the hex value). */
  getLabel?: (color: string) => string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Colour picker built from a grid of swatches. Arrow keys move, roving focus, radio semantics. */
export function SwatchPicker({ colors, value, defaultValue = null, onValueChange, size = 'md', getLabel = (c) => c, disabled, className, ...aria }: SwatchPickerProps) {
  const [current, set] = useControllable<string | null>(value, defaultValue, onValueChange as (c: string | null) => void);
  const field = useFieldControl({ disabled });
  const ref = useRef<HTMLDivElement>(null);
  const norm = (c?: string | null) => c?.toLowerCase();
  const selectedIndex = colors.findIndex((c) => norm(c) === norm(current));

  const onKeyDown = (e: KeyboardEvent) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=radio]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    // Work out the column count from layout so Up/Down move by a whole row.
    const top = items[0].offsetTop;
    const cols = Math.max(1, items.findIndex((el) => el.offsetTop !== top) === -1 ? items.length : items.findIndex((el) => el.offsetTop !== top));
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: items.length - 1 - i }[e.key];
    if (step == null) return;
    e.preventDefault();
    const next = items[Math.min(items.length - 1, Math.max(0, i + step))];
    next.focus();
    next.click();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-labelledby={field.labelId}
      aria-label={aria['aria-label']}
      aria-disabled={field.disabled || undefined}
      className={cx('ui-swatch-picker', className)}
      data-size={size}
      onKeyDown={onKeyDown}
    >
      {colors.map((c, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={c + i}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={getLabel(c)}
            tabIndex={selected || (selectedIndex < 0 && i === 0) ? 0 : -1}
            disabled={field.disabled}
            className="ui-swatch-picker__item"
            style={{ '--_c': c } as React.CSSProperties}
            data-light={colorLuminance(c) > 0.62 || undefined}
            onClick={() => set(c)}
          >
            {selected && <Check aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
