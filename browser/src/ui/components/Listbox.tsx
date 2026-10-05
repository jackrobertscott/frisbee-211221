import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cx } from '../utils';
import './Listbox.css';

export interface Option {
  value: string;
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Right-aligned extra (shortcut, count…). */
  meta?: ReactNode;
  disabled?: boolean;
  /** Options sharing a group are rendered under a heading. */
  group?: string;
}

export function optionId(base: string, i: number) {
  return `${base}-opt-${i}`;
}

interface ListboxProps {
  id: string;
  options: Option[];
  active: number;
  isSelected: (o: Option) => boolean;
  onSelect: (o: Option, i: number) => void;
  onHover: (i: number) => void;
  multiple?: boolean;
  emptyText?: ReactNode;
  /** Highlight this substring in labels (search). */
  highlight?: string;
  labelledBy?: string;
  className?: string;
}

function highlightLabel(label: string, q?: string) {
  if (!q) return label;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <mark className="ui-listbox__mark">{label.slice(i, i + q.length)}</mark>
      {label.slice(i + q.length)}
    </>
  );
}

/** Presentational option list used by Select, Combobox and the command palette. */
export function Listbox({ id, options, active, isSelected, onSelect, onHover, multiple, emptyText = 'No results', highlight, labelledBy, className }: ListboxProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active < 0) return;
    ref.current?.querySelector(`#${CSS.escape(optionId(id, active))}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  let lastGroup: string | undefined;
  return (
    <div
      ref={ref}
      id={id}
      role="listbox"
      aria-multiselectable={multiple || undefined}
      aria-labelledby={labelledBy}
      className={cx('ui-listbox', className)}
      onMouseDown={(e) => e.preventDefault() /* keep focus on the trigger/input */}
    >
      {options.length === 0 && <div className="ui-listbox__empty">{emptyText}</div>}
      {options.map((o, i) => {
        const showGroup = o.group && o.group !== lastGroup;
        lastGroup = o.group;
        const selected = isSelected(o);
        return (
          <Fragment key={o.value}>
            {showGroup && (
              <div className="ui-listbox__group" role="presentation">
                {o.group}
              </div>
            )}
            <div
              id={optionId(id, i)}
              role="option"
              aria-selected={selected}
              aria-disabled={o.disabled || undefined}
              data-active={i === active || undefined}
              className="ui-listbox__option"
              onPointerMove={() => !o.disabled && i !== active && onHover(i)}
              onClick={() => !o.disabled && onSelect(o, i)}
            >
              {multiple && (
                <span className="ui-listbox__check" data-state={selected ? 'checked' : 'unchecked'} aria-hidden>
                  <Check strokeWidth={3} />
                </span>
              )}
              {o.icon && <span className="ui-listbox__icon">{o.icon}</span>}
              <span className="ui-listbox__text">
                <span className="ui-listbox__label">{highlightLabel(o.label, highlight)}</span>
                {o.description && <span className="ui-listbox__desc">{o.description}</span>}
              </span>
              {o.meta && <span className="ui-listbox__meta">{o.meta}</span>}
              {!multiple && selected && <Check className="ui-listbox__tick" aria-hidden />}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
