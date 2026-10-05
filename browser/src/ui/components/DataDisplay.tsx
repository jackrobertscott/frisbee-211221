import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cx } from '../utils';
import './DataDisplay.css';

/* ------------------------------------------------------------------------ */
/* Stat                                                                      */
/* ------------------------------------------------------------------------ */

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Percentage change; sign decides colour and arrow. */
  delta?: number;
  /** Text after the delta, e.g. "vs last month". */
  deltaLabel?: ReactNode;
  /** Invert colours when a decrease is good (e.g. churn). */
  invertDelta?: boolean;
  icon?: ReactNode;
  /** Inline chart / sparkline slot. */
  chart?: ReactNode;
  className?: string;
}

/** KPI card content: label, big number, change indicator. */
export function Stat({ label, value, delta, deltaLabel, invertDelta, icon, chart, className }: StatProps) {
  const up = (delta ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  return (
    <div className={cx('ui-stat', className)}>
      <div className="ui-stat__head">
        {icon && <span className="ui-icon-tile" data-size="sm">{icon}</span>}
        <span className="ui-stat__label">{label}</span>
      </div>
      <div className="ui-stat__body">
        <div>
          <div className="ui-stat__value">{value}</div>
          {delta != null && (
            <div className="ui-stat__delta">
              <span className="ui-stat__chip" data-good={good || undefined}>
                {up ? <ArrowUpRight /> : <ArrowDownRight />}
                {Math.abs(delta)}%
              </span>
              {deltaLabel && <span className="ui-stat__delta-label">{deltaLabel}</span>}
            </div>
          )}
        </div>
        {chart && <div className="ui-stat__chart">{chart}</div>}
      </div>
    </div>
  );
}

/** Minimal inline line chart for stat cards. */
export function Sparkline({ data, width = 96, height = 36, tone = 'accent' }: { data: number[]; width?: number; height?: number; tone?: 'accent' | 'success' | 'danger' | 'neutral' }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((d, i) => [(i / (data.length - 1)) * width, height - 3 - ((d - min) / (max - min || 1)) * (height - 6)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `spk-${tone}`;
  return (
    <svg className="ui-sparkline" data-tone={tone} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* DescriptionList                                                           */
/* ------------------------------------------------------------------------ */

export interface DescriptionListProps {
  items: { term: ReactNode; detail: ReactNode }[];
  layout?: 'horizontal' | 'vertical' | 'grid';
  className?: string;
}

export function DescriptionList({ items, layout = 'horizontal', className }: DescriptionListProps) {
  return (
    <dl className={cx('ui-dl', className)} data-layout={layout}>
      {items.map((it, i) => (
        <div key={i} className="ui-dl__row">
          <dt>{it.term}</dt>
          <dd>{it.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------------ */
/* Timeline                                                                  */
/* ------------------------------------------------------------------------ */

export interface TimelineItem {
  id: string;
  /** Icon or avatar in the marker. */
  marker?: ReactNode;
  title: ReactNode;
  time?: ReactNode;
  children?: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cx('ui-timeline', className)}>
      {items.map((it) => (
        <li key={it.id} className="ui-timeline__item" data-tone={it.tone ?? 'neutral'}>
          <span className="ui-timeline__marker">{it.marker ?? <span className="ui-timeline__dot" />}</span>
          <div className="ui-timeline__content">
            <div className="ui-timeline__head">
              <span className="ui-timeline__title">{it.title}</span>
              {it.time && <time className="ui-timeline__time">{it.time}</time>}
            </div>
            {it.children && <div className="ui-timeline__body">{it.children}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------------ */
/* List                                                                      */
/* ------------------------------------------------------------------------ */

export interface ListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}

/** Bordered list container for rows of ListItem. */
export function List({ children, className, bordered = true }: { children: ReactNode; className?: string; bordered?: boolean }) {
  return <ul className={cx('ui-list', bordered && 'ui-list--bordered', className)}>{children}</ul>;
}

export function ListItem({ leading, title, description, trailing, onClick, active }: ListItemProps) {
  const content = (
    <>
      {leading && <span className="ui-list__leading">{leading}</span>}
      <span className="ui-list__text">
        <span className="ui-list__title">{title}</span>
        {description && <span className="ui-list__desc">{description}</span>}
      </span>
      {trailing && <span className="ui-list__trailing">{trailing}</span>}
    </>
  );
  return (
    <li className="ui-list__item" data-active={active || undefined}>
      {onClick ? (
        <button type="button" className="ui-list__row ui-list__row--btn" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="ui-list__row">{content}</div>
      )}
    </li>
  );
}
