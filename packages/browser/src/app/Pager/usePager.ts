import {useMemo, useState} from 'react'
/**
 *
 */
export interface TPager {
  total?: number
  limit: number
  skip: number
}
/**
 *
 */
export const usePager = (defaults?: Partial<TPager>) => {
  const [pager, pagerSet] = useState<TPager>({
    limit: 25,
    skip: 0,
    ...defaults,
  })
  return useMemo(() => {
    return {
      ...pager,
      data: pager,
      dataSet: pagerSet,
      totalSet: (total?: number) => pagerSet((i) => ({...i, total})),
    }
  }, [pager])
}
