import type { ReactNode } from 'react';
import { cx } from '../utils';
import { Tooltip } from './Tooltip';
import './Chart.css';

export interface ChartSeries {
  key: string;
  label: string;
  /** CSS colour; defaults to the --chart-N palette. */
  color?: string;
}

export interface BarDatum {
  label: string;
  /** One value per series, keyed by series key. */
  values: Record<string, number>;
}

export interface BarChartProps {
  data: BarDatum[];
  series: ChartSeries[];
  height?: number;
  /** Axis captions. */
  xLabel?: ReactNode;
  yLabel?: ReactNode;
  /** Hide the legend (shown automatically for 2+ series). */
  hideLegend?: boolean;
  formatValue?: (v: number) => string;
  /** Accessible summary of what the chart shows. */
  'aria-label': string;
  className?: string;
}

/** Pick a "nice" tick step so the y axis reads 0, 2, 4… or 0, 5, 10… */
function niceStep(max: number, target = 5) {
  if (max <= 0) return 1;
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const paletteColor = (i: number) => `var(--chart-${(i % 5) + 1})`;

/** Grouped vertical bar chart with gridlines, tooltips, legend and a screen-reader data table. */
export function BarChart({ data, series, height = 240, xLabel, yLabel, hideLegend, formatValue = (v) => String(v), className, ...aria }: BarChartProps) {
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const colors = series.map((s, i) => s.color ?? paletteColor(i));

  return (
    <figure className={cx('ui-chart', className)}>
      {series.length > 1 && !hideLegend && (
        <div className="ui-chart__legend">
          {series.map((s, i) => (
            <span key={s.key}>
              <i style={{ background: colors[i] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="ui-chart__body">
        {yLabel && <div className="ui-chart__ylabel">{yLabel}</div>}
        <div className="ui-chart__yaxis" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              {formatValue(t)}
            </span>
          ))}
        </div>
        <div className="ui-chart__main">
          <div className="ui-chart__plot" style={{ height }} role="img" aria-label={aria['aria-label']}>
            {ticks.map((t) => (
              <span key={t} className="ui-chart__grid" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
            ))}
            {data.map((d) => (
              <div key={d.label} className="ui-chart__col">
                {series.map((s, i) => {
                  const v = d.values[s.key] ?? 0;
                  return (
                    <Tooltip key={s.key} content={`${d.label} · ${series.length > 1 ? `${s.label}: ` : ''}${formatValue(v)}`} delay={0}>
                      <span className="ui-chart__bar" tabIndex={-1} data-empty={v === 0 || undefined} style={{ height: `${(v / top) * 100}%`, background: colors[i] }} />
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="ui-chart__xaxis" aria-hidden>
            {data.map((d) => (
              <span key={d.label}>{d.label}</span>
            ))}
          </div>
          {xLabel && <div className="ui-chart__xlabel">{xLabel}</div>}
        </div>
      </div>
      <table className="ui-sr-only">
        <caption>{aria['aria-label']}</caption>
        <thead>
          <tr>
            <th scope="col">{xLabel ?? 'Label'}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              {series.map((s) => (
                <td key={s.key}>{formatValue(d.values[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
