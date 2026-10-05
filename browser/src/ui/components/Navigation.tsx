import { Fragment, useMemo, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal } from 'lucide-react';
import { cx } from '../utils';
import { Button } from './Button';
import { Select } from './Select';
import { Menu, MenuItem } from './Menu';
import './Navigation.css';

/* ------------------------------------------------------------------------ */
/* Breadcrumbs                                                               */
/* ------------------------------------------------------------------------ */

export interface Crumb {
  label: ReactNode;
  href?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  /** Collapse middle items into a menu beyond this count. */
  maxItems?: number;
  separator?: 'chevron' | 'slash';
  className?: string;
}

export function Breadcrumbs({ items, maxItems = 5, separator = 'chevron', className }: BreadcrumbsProps) {
  const collapse = items.length > maxItems;
  const head = collapse ? [items[0]] : items;
  const hidden = collapse ? items.slice(1, items.length - (maxItems - 2)) : [];
  const tail = collapse ? items.slice(items.length - (maxItems - 2)) : [];
  const sep = (
    <li aria-hidden className="ui-crumbs__sep">
      {separator === 'chevron' ? <ChevronRight /> : '/'}
    </li>
  );
  const renderCrumb = (c: Crumb, last: boolean) => (
    <li className="ui-crumbs__item">
      {last ? (
        <span aria-current="page" className="ui-crumbs__current">
          {c.icon}
          {c.label}
        </span>
      ) : (
        <a
          href={c.href ?? '#'}
          className="ui-crumbs__link"
          onClick={(e) => {
            if (c.onClick) {
              e.preventDefault();
              c.onClick();
            }
          }}
        >
          {c.icon}
          {c.label}
        </a>
      )}
    </li>
  );
  return (
    <nav aria-label="Breadcrumb" className={cx('ui-crumbs', className)}>
      <ol>
        {head.map((c, i) => (
          <Fragment key={`h${i}`}>
            {i > 0 && sep}
            {renderCrumb(c, !collapse && i === items.length - 1)}
          </Fragment>
        ))}
        {collapse && (
          <>
            {sep}
            <li>
              <Menu
                trigger={
                  <button type="button" className="ui-crumbs__more" aria-label="Show hidden breadcrumbs">
                    <MoreHorizontal />
                  </button>
                }
              >
                {hidden.map((c, i) => (
                  <MenuItem key={i} icon={c.icon} onSelect={c.onClick}>
                    {c.label}
                  </MenuItem>
                ))}
              </Menu>
            </li>
            {tail.map((c, i) => (
              <Fragment key={`t${i}`}>
                {sep}
                {renderCrumb(c, i === tail.length - 1)}
              </Fragment>
            ))}
          </>
        )}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------------ */
/* Pagination                                                                */
/* ------------------------------------------------------------------------ */

function pageRange(page: number, total: number, siblings = 1): (number | '…')[] {
  const size = siblings * 2 + 5;
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 2);
  const right = Math.min(page + siblings, total - 1);
  const out: (number | '…')[] = [1];
  if (left > 3) out.push('…');
  else for (let i = 2; i < left; i++) out.push(i);
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 2) out.push('…');
  else for (let i = right + 1; i < total; i++) out.push(i);
  out.push(total);
  return out;
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  /** full = summary + page size + numbered pages (reference design); simple = prev/next only. */
  variant?: 'full' | 'numbers' | 'simple';
  /** Total item count for the "x–y of z" summary. */
  total?: number;
  className?: string;
}

export function Pagination({ page, pageCount, onPageChange, pageSize, pageSizeOptions = [10, 20, 50], onPageSizeChange, variant = 'full', total, className }: PaginationProps) {
  const pages = useMemo(() => pageRange(page, pageCount), [page, pageCount]);
  const go = (p: number) => onPageChange(Math.max(1, Math.min(pageCount, p)));
  const nav = (
    <div className="ui-pagination__nav">
      {variant === 'full' && (
        <Button variant="secondary" size="sm" iconOnly aria-label="First page" disabled={page <= 1} onClick={() => go(1)}>
          <ChevronsLeft />
        </Button>
      )}
      <Button variant="secondary" size="sm" iconOnly={variant !== 'simple'} leading={variant === 'simple' ? <ChevronLeft /> : undefined} aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
        {variant === 'simple' ? 'Previous' : <ChevronLeft />}
      </Button>
      {variant !== 'simple' && (
        <div className="ui-pagination__pages">
          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="ui-pagination__ellipsis">
                …
              </span>
            ) : (
              <button key={p} type="button" className="ui-pagination__page" aria-current={p === page ? 'page' : undefined} onClick={() => go(p)}>
                {p}
              </button>
            ),
          )}
        </div>
      )}
      {variant === 'simple' && (
        <span className="ui-pagination__summary">
          Page {page} of {pageCount}
        </span>
      )}
      <Button variant="secondary" size="sm" iconOnly={variant !== 'simple'} trailing={variant === 'simple' ? <ChevronRight /> : undefined} aria-label="Next page" disabled={page >= pageCount} onClick={() => go(page + 1)}>
        {variant === 'simple' ? 'Next' : <ChevronRight />}
      </Button>
      {variant === 'full' && (
        <Button variant="secondary" size="sm" iconOnly aria-label="Last page" disabled={page >= pageCount} onClick={() => go(pageCount)}>
          <ChevronsRight />
        </Button>
      )}
    </div>
  );
  if (variant !== 'full') return <div className={cx('ui-pagination', className)}>{nav}</div>;
  return (
    <div className={cx('ui-pagination', 'ui-pagination--full', className)}>
      <div className="ui-pagination__meta">
        <span>Page</span>
        <span className="ui-pagination__box">{page}</span>
        <span>of {pageCount}</span>
        {pageSize != null && onPageSizeChange && (
          <>
            <span className="ui-pagination__div" />
            <span>Rows per page</span>
            <Select
              size="sm"
              aria-label="Rows per page"
              value={String(pageSize)}
              onValueChange={(v) => v && onPageSizeChange(Number(v))}
              options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
              className="ui-pagination__size"
            />
          </>
        )}
        {total != null && pageSize != null && (
          <span className="ui-pagination__total">
            {Math.min(total, (page - 1) * pageSize + 1)}–{Math.min(total, page * pageSize)} of {total}
          </span>
        )}
      </div>
      {nav}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Stepper                                                                   */
/* ------------------------------------------------------------------------ */

export interface Step {
  title: ReactNode;
  description?: ReactNode;
}

export interface StepperProps {
  steps: Step[];
  /** Zero-based index of the current step. */
  current: number;
  orientation?: 'horizontal' | 'vertical';
  onStepClick?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, current, orientation = 'horizontal', onStepClick, className }: StepperProps) {
  return (
    <ol className={cx('ui-stepper', className)} data-orientation={orientation}>
      {steps.map((s, i) => {
        const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming';
        const clickable = onStepClick && i < current;
        return (
          <li key={i} className="ui-stepper__step" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <button type="button" className="ui-stepper__marker" disabled={!clickable} onClick={() => clickable && onStepClick(i)} aria-label={`Step ${i + 1}`}>
              {state === 'complete' ? <Check /> : <span>{i + 1}</span>}
            </button>
            <div className="ui-stepper__text">
              <div className="ui-stepper__title">{s.title}</div>
              {s.description && <div className="ui-stepper__desc">{s.description}</div>}
            </div>
            {i < steps.length - 1 && <span className="ui-stepper__line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
