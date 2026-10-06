import {render, RenderOptions} from '@testing-library/react'
import {createMemoryHistory, Location} from 'history'
import {ReactElement, ReactNode} from 'react'
import {vi} from 'vitest'
import {canAccess} from '../core/auth/authAccess'
import {TAuth, TAuthContext, AuthContext} from '../core/auth/AuthContext'
import {RouterProvider} from '../core/router/RouterProvider'
import {ShellProvider} from '../app/shell/ShellProvider'
import {makeSeason} from './fixtures'

export interface TRenderAppOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Signed in user; omit for a signed out visitor. */
  auth?: TAuth
  /** Overrides for the auth context (season, spies, ...). */
  context?: Partial<TAuthContext>
  /** Initial location, e.g. `/teams?page=2`. */
  path?: string
  /** Wrap in the app <ShellProvider> (default true). */
  shell?: boolean
}

/**
 * Renders UI inside a static auth context and a router fixed to `path`.
 * Wrapped in the app shell unless `shell: false`.
 * Context methods are vitest spies so tests can assert on them.
 */
export const renderApp = (ui: ReactElement, options: TRenderAppOptions = {}) => {
  const {auth, context: patch, path = '/', shell = true, ...rest} = options
  const location: Location = createMemoryHistory({initialEntries: [path]})
    .location
  const context: TAuthContext = {
    loaded: true,
    season: makeSeason(),
    current: auth,
    login: vi.fn(),
    logout: vi.fn(),
    invalidate: vi.fn(),
    userSet: vi.fn(),
    teamSet: vi.fn(),
    seasonSet: vi.fn(),
    isAdmin: () => !!auth?.user.admin,
    can: (point) => canAccess(auth, point),
    ...patch,
  }
  const Wrapper = ({children}: {children: ReactNode}) => (
    <AuthContext.Provider value={context}>
      <RouterProvider location={location}>
        {shell ? <ShellProvider>{children}</ShellProvider> : children}
      </RouterProvider>
    </AuthContext.Provider>
  )
  return {context, ...render(ui, {wrapper: Wrapper, ...rest})}
}
