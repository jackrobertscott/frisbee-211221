/* jsdom gaps used by @ui components (floating popups, tabs, listboxes). */

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined')
  globalThis.ResizeObserver = ResizeObserverStub

if (typeof Element.prototype.scrollIntoView !== 'function')
  Element.prototype.scrollIntoView = function scrollIntoView() {}

if (typeof window.matchMedia !== 'function')
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })

// jsdom logs "Not implemented" for scrollTo; navigate() calls it on every route change.
window.scrollTo = () => {}
