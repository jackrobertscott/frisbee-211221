import {Pagination} from '@ui'
import {useRef, useState} from 'react'
import {useDebounced} from './useDebounced'

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
