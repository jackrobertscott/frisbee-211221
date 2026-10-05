import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cx, useControllable } from '../utils';
import { useFieldControl } from './Field';
import './Slider.css';

export interface SliderProps {
  /** One value for a single thumb, two for a range. */
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  /** Fires on pointer up / key commit. */
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Tick labels under the track. */
  marks?: { value: number; label?: string }[];
  /** Show the value in a bubble while dragging/focused. */
  showTooltip?: boolean;
  formatValue?: (v: number) => string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Single or range slider with pointer + full keyboard support. */
export function Slider({
  value,
  defaultValue = [50],
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  disabled: disabledProp,
  marks,
  showTooltip = true,
  formatValue = (v) => String(v),
  id,
  className,
  ...aria
}: SliderProps) {
  const field = useFieldControl({ id, disabled: disabledProp });
  const disabled = field.disabled;
  const [vals, setVals] = useControllable(value, defaultValue, onValueChange);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min;
    return clamp(Number(s.toFixed(10)), min, max);
  };

  const update = (index: number, raw: number) => {
    const next = [...vals];
    let v = snap(raw);
    if (vals.length === 2) v = index === 0 ? Math.min(v, vals[1]) : Math.max(v, vals[0]);
    next[index] = v;
    if (next[index] !== vals[index]) setVals(next);
    return next;
  };

  const valueAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return min + clamp((clientX - r.left) / r.width, 0, 1) * (max - min);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    const v = valueAt(e.clientX);
    // Pick the nearest thumb.
    let index = 0;
    if (vals.length === 2) {
      const d0 = Math.abs(v - vals[0]);
      const d1 = Math.abs(v - vals[1]);
      index = d0 < d1 || (d0 === d1 && v < vals[0]) ? 0 : 1;
    }
    update(index, v);
    setDragging(index);
    (trackRef.current!.querySelectorAll<HTMLElement>('[role=slider]')[index])?.focus();
    let latest = vals;
    const moveTrack = (ev: globalThis.PointerEvent) => {
      latest = update(index, valueAt(ev.clientX));
    };
    const up = () => {
      setDragging(null);
      window.removeEventListener('pointermove', moveTrack);
      window.removeEventListener('pointerup', up);
      onValueCommit?.(latest);
    };
    window.addEventListener('pointermove', moveTrack);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (index: number) => (e: KeyboardEvent) => {
    const big = (max - min) / 10;
    const map: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: big,
      PageDown: -big,
    };
    let next: number | undefined;
    if (e.key in map) next = vals[index] + map[e.key] * (e.shiftKey ? 10 : 1);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === undefined) return;
    e.preventDefault();
    onValueCommit?.(update(index, next));
  };

  const range = vals.length === 2;
  const start = range ? pct(vals[0]) : 0;
  const end = pct(vals[vals.length - 1]);

  return (
    <div className={cx('ui-slider', marks && 'ui-slider--marks', className)} data-disabled={disabled || undefined}>
      <div ref={trackRef} className="ui-slider__track" onPointerDown={onPointerDown}>
        <div className="ui-slider__range" style={{ left: `${start}%`, width: `${end - start}%` }} />
        {marks?.map((m) => (
          <span key={m.value} className="ui-slider__tick" data-in={(m.value >= (range ? vals[0] : min) && m.value <= vals[vals.length - 1]) || undefined} style={{ left: `${pct(m.value)}%` }} />
        ))}
        {vals.map((v, i) => (
          <span
            key={i}
            id={i === 0 ? field.id : undefined}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-valuemin={range && i === 1 ? vals[0] : min}
            aria-valuemax={range && i === 0 ? vals[1] : max}
            aria-valuenow={v}
            aria-valuetext={formatValue(v)}
            aria-orientation="horizontal"
            aria-disabled={disabled || undefined}
            aria-labelledby={field.labelId}
            aria-label={aria['aria-label'] ? `${aria['aria-label']}${range ? (i === 0 ? ' minimum' : ' maximum') : ''}` : undefined}
            className="ui-slider__thumb"
            data-dragging={dragging === i || undefined}
            style={{ left: `${pct(v)}%` }}
            onKeyDown={onKeyDown(i)}
          >
            {showTooltip && <span className="ui-slider__bubble">{formatValue(v)}</span>}
          </span>
        ))}
      </div>
      {marks && (
        <div className="ui-slider__marks" aria-hidden>
          {marks.map((m) =>
            m.label ? (
              <span key={m.value} style={{ left: `${pct(m.value)}%` }}>
                {m.label}
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
