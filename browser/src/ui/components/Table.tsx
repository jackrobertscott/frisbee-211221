import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cx, useControllable } from '../utils';
import { Checkbox } from './Checkbox';
import { Skeleton } from './Feedback';
import './Table.css';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer; defaults to row[key]. */
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  /** Value used for sorting (defaults to row[key]). */
  sortValue?: (row: T) => string | number | Date;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  /** Hide below this viewport width (responsive). */
  hideBelow?: 'sm' | 'md' | 'lg';
  /** Keep the cell on one line (short values such as dates, codes or labels like "Division 1"). */
  nowrap?: boolean;
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (keys: string[]) => void;
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Sort rows internally (set false when sorting server-side). */
  sortRows?: boolean;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** Shown when rows is empty. */
  empty?: ReactNode;
  density?: 'compact' | 'default' | 'comfortable';
  stickyHeader?: boolean;
  /** Rendered in a floating bar while rows are selected. */
  bulkActions?: (keys: string[], clear: () => void) => ReactNode;
  /** Wrap in a bordered card (default true). */
  bordered?: boolean;
  className?: string;
  'aria-label'?: string;
}

function get(row: unknown, key: string): any {
  return (row as Record<string, unknown>)[key];
}

/** Data table with sorting, selection, loading and empty states. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable,
  selected,
  defaultSelected = [],
  onSelectedChange,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  sortRows = true,
  onRowClick,
  loading,
  empty,
  density = 'default',
  stickyHeader,
  bulkActions,
  bordered = true,
  className,
  ...aria
}: DataTableProps<T>) {
  const [sel, setSel] = useControllable(selected, defaultSelected, onSelectedChange);
  const [sort, setSort] = useControllable<SortState | null>(sortProp, defaultSort, onSortChange);
  const [lastClicked, setLastClicked] = useState<number | null>(null);

  const sorted = useMemo(() => {
    if (!sort || !sortRows) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.sortValue ?? ((r: T) => get(r, col.key));
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const cmp = x instanceof Date && y instanceof Date ? x.getTime() - y.getTime() : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns, sortRows]);

  const keys = sorted.map(rowKey);
  const allSelected = keys.length > 0 && keys.every((k) => sel.includes(k));
  const someSelected = !allSelected && keys.some((k) => sel.includes(k));

  const cycleSort = (key: string) => {
    if (!sort || sort.key !== key) setSort({ key, direction: 'asc' });
    else if (sort.direction === 'asc') setSort({ key, direction: 'desc' });
    else setSort(null);
  };

  const toggleRow = (i: number, shift: boolean) => {
    const k = keys[i];
    const on = !sel.includes(k);
    if (shift && lastClicked != null) {
      const [a, b] = [Math.min(lastClicked, i), Math.max(lastClicked, i)];
      const range = keys.slice(a, b + 1);
      setSel(on ? Array.from(new Set([...sel, ...range])) : sel.filter((x) => !range.includes(x)));
    } else {
      setSel(on ? [...sel, k] : sel.filter((x) => x !== k));
    }
    setLastClicked(i);
  };

  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className={cx('ui-table-wrap', bordered && 'ui-table-wrap--bordered', className)} data-density={density}>
      <div className="ui-table-scroll">
        <table className="ui-table" aria-label={aria['aria-label']} aria-busy={loading || undefined} data-sticky={stickyHeader || undefined}>
          <thead>
            <tr>
              {selectable && (
                <th className="ui-table__select" scope="col">
                  <Checkbox
                    size="sm"
                    aria-label="Select all rows"
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={() => setSel(allSelected || someSelected ? sel.filter((k) => !keys.includes(k)) : Array.from(new Set([...sel, ...keys])))}
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={{ width: c.width, textAlign: c.align }}
                    data-hide={c.hideBelow}
                    aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {c.sortable ? (
                      <button type="button" className="ui-table__sort" data-active={active || undefined} onClick={() => cycleSort(c.key)}>
                        {c.header}
                        {active ? sort!.direction === 'asc' ? <ArrowUp /> : <ArrowDown /> : <ChevronsUpDown />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`sk${i}`} className="ui-table__row--skeleton">
                  {selectable && (
                    <td className="ui-table__select">
                      <Skeleton width={14} height={14} />
                    </td>
                  )}
                  {columns.map((c, j) => (
                    <td key={c.key} data-hide={c.hideBelow}>
                      <Skeleton width={j === 0 ? '70%' : '50%'} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={colCount} className="ui-table__empty">
                  {empty ?? 'No data'}
                </td>
              </tr>
            )}
            {!loading &&
              sorted.map((row, i) => {
                const k = keys[i];
                const isSel = sel.includes(k);
                return (
                  <tr
                    key={k}
                    aria-selected={selectable ? isSel : undefined}
                    data-clickable={onRowClick ? true : undefined}
                    onClick={(e) => {
                      if ((e.target as Element).closest('button, a, input, [role=checkbox], [role=menuitem]')) return;
                      onRowClick?.(row);
                    }}
                  >
                    {selectable && (
                      <td className="ui-table__select" onClick={(e) => e.shiftKey && e.preventDefault()}>
                        <span
                          onClickCapture={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleRow(i, e.shiftKey);
                          }}
                        >
                          <Checkbox size="sm" aria-label="Select row" checked={isSel} />
                        </span>
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} style={{ textAlign: c.align }} data-hide={c.hideBelow} data-nowrap={c.nowrap || undefined}>
                        {c.render ? c.render(row, i) : String(get(row, c.key) ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {bulkActions && sel.length > 0 && (
        <div className="ui-table__bulk" role="toolbar" aria-label="Bulk actions">
          <span className="ui-table__bulk-count">{sel.length} selected</span>
          <span className="ui-table__bulk-sep" />
          {bulkActions(sel, () => setSel([]))}
        </div>
      )}
    </div>
  );
}
