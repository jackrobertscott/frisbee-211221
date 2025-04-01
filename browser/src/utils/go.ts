import {history} from './history'

/**
 *
 */
export const go = {
  /**
   *
   */
  to(path: string) {
    history.push(path)
    window.scrollTo(0, 0)
  },
}
