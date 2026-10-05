import {ChevronDown} from 'lucide-react'
import {type ReactNode} from 'react'

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
