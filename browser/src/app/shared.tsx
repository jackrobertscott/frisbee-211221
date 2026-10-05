/* Small compositions shared across the league app (built only from ui library components). */
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic, TUserSafe} from '@shared/schemas/ioUser'
import {
  Button,
  cx,
  EmptyState,
  Pagination,
  SearchInput,
  Spinner,
  Swatch,
  Text,
  type Option,
} from '@ui'
import {ChevronDown, CloudOff, RotateCw} from 'lucide-react'
import {type ReactNode, useEffect, useRef, useState} from 'react'
import {userEmails} from '../utils/userEmails'

type TDateInput = string | number | Date

const asDate = (d: TDateInput) => (d instanceof Date ? d : new Date(d))

export const fmtDate = (d: TDateInput) =>
  new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(asDate(d))

export const fmtShort = (d: TDateInput) =>
  new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(asDate(d))

export const fmtDateTime = (d: TDateInput) =>
  new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(asDate(d))

export const fullName = (u: {firstName: string; lastName: string}) =>
  `${u.firstName} ${u.lastName}`.trim()

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && !/^the$/i.test(w))
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/** Anything with a team name and optional colour (teams, report rows, missing-report rows). */
export type TTeamLike = {name: string; color?: string}

/** Team name with its colour chip. */
export function TeamName({
  team,
  size = 'sm',
  short,
  muted,
  wrap,
}: {
  team?: TTeamLike
  size?: 'sm' | 'md'
  short?: boolean
  muted?: boolean
  /** Let long names wrap instead of truncating (narrow table cells). */
  wrap?: boolean
}) {
  if (!team)
    return (
      <Text as="span" size="sm" tone="tertiary">
        Unknown team
      </Text>
    )
  const label = short ? initials(team.name) : team.name
  return (
    <span className={cx('fr-team', muted && 'fr-team--muted', wrap && 'fr-team--wrap')} data-size={size}>
      {team.color && (
        <Swatch color={team.color} size={size === 'md' ? 'md' : 'sm'} />
      )}
      <span className="fr-team__name" title={short ? team.name : undefined}>
        {label}
      </span>
    </span>
  )
}

/**
 * Table cell with a primary line and a quieter second line. `narrowOnly` shows the second line
 * only on phones, where the column holding that value is hidden (`hideBelow: 'sm'`).
 */
export function CellStack({
  primary,
  secondary,
  narrowOnly,
}: {
  primary: ReactNode
  secondary: ReactNode
  narrowOnly?: boolean
}) {
  return (
    <span className="fr-cell-stack">
      <span className="fr-cell-stack__primary">{primary}</span>
      <span className={cx('fr-cell-stack__secondary', narrowOnly && 'fr-narrow-only')}>
        {secondary}
      </span>
    </span>
  )
}

export const teamOptions = (teams: TTeam[]): Option[] =>
  teams.map((t) => ({
    value: t.id,
    label: t.name,
    icon: <Swatch color={t.color} />,
    meta: typeof t.division === 'number' ? `Div ${t.division}` : undefined,
  }))

export const userOptions = (users: Array<TUserPublic | TUserSafe>): Option[] =>
  users.map((u) => ({
    value: u.id,
    label: fullName(u),
    description: 'emails' in u ? userEmails.primary(u) : undefined,
  }))

/** A card-like disclosure row: title on the left, meta + chevron on the right, optional action button. */
export function FixtureRow({
  title,
  meta,
  open,
  onToggle,
  action,
  children,
}: {
  title: ReactNode
  meta?: ReactNode
  open: boolean
  onToggle: () => void
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="fr-row" data-open={open || undefined}>
      <div className="fr-row__head">
        <button
          type="button"
          className="fr-row__toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="fr-row__title">{title}</span>
          <span className="fr-row__meta">{meta}</span>
          <ChevronDown className="fr-row__chevron" aria-hidden />
        </button>
        {action && <div className="fr-row__action">{action}</div>}
      </div>
      {open && <div className="fr-row__body">{children}</div>}
    </section>
  )
}

export function Toolbar({
  search,
  onSearch,
  placeholder = 'Search',
  children,
}: {
  search?: string
  onSearch?: (q: string) => void
  placeholder?: string
  children?: ReactNode
}) {
  return (
    <div className="fr-toolbar">
      {onSearch && (
        <SearchInput
          className="fr-toolbar__search"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onClear={() => onSearch('')}
        />
      )}
      <div className="fr-toolbar__actions">{children}</div>
    </div>
  )
}

/** Centered spinner for page and panel loading states; shows a retry state once loading failed. */
export function Loading({
  label = 'Loading',
  failed,
  onRetry,
}: {
  label?: string
  failed?: boolean
  onRetry?: () => void
}) {
  if (failed)
    return (
      <div className="fr-loading">
        <EmptyState
          icon={<CloudOff />}
          title="Couldn’t load this"
          description="Check your connection and try again."
          actions={
            onRetry && (
              <Button leading={<RotateCw />} onClick={onRetry}>
                Try again
              </Button>
            )
          }
        />
      </div>
    )
  return (
    <div className="fr-loading fr-loading--pending" role="status" aria-label={label}>
      <Spinner />
    </div>
  )
}

/** Debounces a fast-changing value (search boxes feeding server queries). */
export function useDebounced<T>(value: T, ms = 300) {
  const [current, currentSet] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => currentSet(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return current
}

/**
 * Server-side search + paging state for directory pages. Sorting and filtering
 * happen in the endpoint (see AGENTS.md); this only tracks the request params
 * and renders the pager.
 */
export function useServerPaging(opts?: {pageSize?: number}) {
  const [query, querySet] = useState('')
  const [page, pageSet] = useState(1)
  const [pageSize, pageSizeSet] = useState(opts?.pageSize ?? 25)
  const search = useDebounced(query)
  const lastSearch = useRef(search)
  if (lastSearch.current !== search) {
    lastSearch.current = search
    if (page !== 1) pageSet(1)
  }
  return {
    query,
    setQuery: querySet,
    /** Debounced search text to send to the server. */
    search,
    page,
    setPage: pageSet,
    pageSize,
    skip: (page - 1) * pageSize,
    limit: pageSize,
    pager: (total: number) => (
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        onPageChange={pageSet}
        pageSize={pageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        onPageSizeChange={(n) => {
          pageSizeSet(n)
          pageSet(1)
        }}
        total={total}
      />
    ),
  }
}
