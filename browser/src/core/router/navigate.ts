import {history} from './history'

/** Pushes a new app path and scrolls back to the top (for use outside React). */
export const navigate = (path: string) => {
  history.push(path)
  window.scrollTo(0, 0)
}
