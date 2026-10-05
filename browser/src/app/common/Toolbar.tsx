import {SearchInput} from '@ui'
import {type ReactNode} from 'react'

/** Search box plus a slot for page actions, shown above list views. */
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
