import {history} from './history'

const maxChanges = 50
const maxAge = 1000 * 60 * 60

/** How long and how much this page load has been used; reset per test. */
export const pageLoad = {at: Date.now(), changes: 0}

/** True once the app has been open long enough that it should load fresh. */
const isStale = () => {
  pageLoad.changes = pageLoad.changes + 1
  return (
    pageLoad.changes >= maxChanges || Date.now() - pageLoad.at >= maxAge
  )
}

/**
 * Pushes a new app path and scrolls back to the top (for use outside React).
 * A stale app loads the path as a fresh page instead, so new deploys and
 * cleared memory land on a page change rather than after it renders.
 */
export const navigate = (path: string) => {
  if (isStale()) return window.location.assign(path)
  history.push(path)
  window.scrollTo(0, 0)
}
