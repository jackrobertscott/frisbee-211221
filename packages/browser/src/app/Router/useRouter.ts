import {useContext} from 'react'
import * as queryString from 'query-string'
import {RouterContext, TRouteQuery} from './RouterContext'
import {history} from '../../utils/history'
/**
 *
 */
export const useRouter = () => {
  const context = useContext(RouterContext)
  if (!context.location) throw new Error('Router context is not setup.')
  const query = queryString.parse(context.location.search) as TRouteQuery
  return {
    ...context,
    query,
    go(path: string) {
      history.push(path)
      window.scrollTo(0, 0)
    },
    back() {
      history.back()
    },
  }
}
