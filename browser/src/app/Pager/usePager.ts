import {useMemo, useState} from 'react'
/**
 *
 */
export interface TPager {
  limit: number
  skip: number
}
/**
 *
 */
export const usePager = (defaults?: Partial<TPager>) => {
  const [total, totalSet] = useState<number>()
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
      total,
      totalSet,
    }
  }, [pager, total])
}
