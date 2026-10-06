import {isAppError} from '@shared/errors'
import {act, render, renderHook, screen} from '@testing-library/react'
import {createMemoryHistory} from 'history'
import {ReactNode} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {history} from './history'
import {navigate} from './navigate'
import {Router} from './Router'
import {TRoute} from './RouterContext'
import {RouterProvider} from './RouterProvider'
import {useRouter} from './useRouter'

const route = (
  path: string,
  label: string,
  patch: Partial<TRoute> = {},
): TRoute => ({
  path,
  render: (params) => (
    <p>
      {label}
      {Object.entries(params).map(([key, value]) => ` ${key}=${value}`)}
    </p>
  ),
  ...patch,
})

const renderAt = (path: string, ui: ReactNode) => {
  act(() => history.replace(path))
  return render(<RouterProvider>{ui}</RouterProvider>)
}

/** RouterProvider applies history changes on the next tick. */
const flush = () => act(() => new Promise((r) => setTimeout(r)))

const scrollTo = vi.fn((_x: number, _y: number) => undefined)

beforeEach(() => {
  scrollTo.mockClear()
  vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo)
})

describe('Router matching', () => {
  const routes = [
    route('/teams/:teamId', 'Team', {exact: true}),
    route('/teams', 'Teams'),
    route('/', 'Home'),
  ]

  it('renders the first matching route with its params', () => {
    renderAt('/teams/abc', <Router fallback="/" routes={routes} />)
    expect(screen.getByText('Team teamId=abc')).toBeInTheDocument()
  })

  it('treats non exact routes as prefixes', () => {
    renderAt('/teams/abc/members', <Router fallback="/" routes={routes} />)
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })

  it('lets a non exact "/" catch every other path', () => {
    renderAt('/anything/else', <Router fallback="/" routes={routes} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('does not let an exact "/" catch nested paths', () => {
    renderAt(
      '/missing',
      <Router
        fallback="/teams"
        routes={[route('/', 'Home', {exact: true}), route('/teams', 'Teams')]}
      />,
    )
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
  })

  it('ignores disabled (false) routes', () => {
    const admin: TRoute | false = false
    renderAt(
      '/admin',
      <Router fallback="/" routes={[admin, route('/', 'Home')]} />,
    )
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('matches nested routes under a prefix', () => {
    renderAt(
      '/admin/users',
      <Router
        prefix="/admin"
        fallback="/seasons"
        routes={[route('/users', 'Users'), route('/seasons', 'Seasons')]}
      />,
    )
    expect(screen.getByText('Users')).toBeInTheDocument()
  })

  it('wraps the matched route with render and exposes route context', () => {
    const routes = [route('/teams/:teamId', 'Team'), route('/', 'Home')]
    renderAt(
      '/teams/t1?tab=members',
      <Router
        fallback="/"
        routes={routes}
        render={(children, context) => (
          <section>
            <h1>
              {context.current.path} {context.params.teamId} {context.query.tab}{' '}
              {context.routes.length}
            </h1>
            {children}
          </section>
        )}
      />,
    )
    expect(
      screen.getByRole('heading', {name: '/teams/:teamId t1 members 2'}),
    ).toBeInTheDocument()
    expect(screen.getByText('Team teamId=t1')).toBeInTheDocument()
  })

  it('provides the matched route as a parent to nested routers', () => {
    const Crumbs = () => {
      const router = useRouter()
      return <p>{router.parents.map((i) => i.label).join(' > ')}</p>
    }
    renderAt(
      '/admin/users',
      <Router
        fallback="/"
        routes={[
          route('/admin', 'Admin', {
            label: 'Admin',
            render: () => (
              <Router
                prefix="/admin"
                fallback="/users"
                routes={[
                  {path: '/users', label: 'Users', render: () => <Crumbs />},
                ]}
              />
            ),
          }),
        ]}
      />,
    )
    expect(screen.getByText('Admin > Users')).toBeInTheDocument()
  })
})

describe('Router fallback', () => {
  it('redirects unmatched paths to the prefixed fallback', async () => {
    renderAt(
      '/admin/unknown',
      <Router
        prefix="/admin"
        fallback="/users"
        routes={[route('/users', 'Users')]}
      />,
    )
    expect(history.location.pathname).toBe('/admin/users')
    await flush()
    expect(screen.getByText('Users')).toBeInTheDocument()
  })

  it('renders nothing rather than looping when the fallback does not match', () => {
    renderAt(
      '/users',
      <Router
        fallback="/users"
        routes={[route('/teams', 'Teams', {exact: true})]}
      />,
    )
    expect(history.location.pathname).toBe('/users')
    expect(screen.queryByText('Teams')).not.toBeInTheDocument()
  })

  it('requires at least one enabled route', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let caught: unknown
    try {
      renderAt('/', <Router fallback="/" routes={[false]} />)
    } catch (error) {
      caught = error
    }
    expect(isAppError(caught) && caught.errorCode).toBe('router.routes_missing')
  })
})

describe('RouterProvider', () => {
  it('follows browser history changes', async () => {
    renderAt(
      '/',
      <Router
        fallback="/"
        routes={[route('/teams', 'Teams'), route('/', 'Home')]}
      />,
    )
    expect(screen.getByText('Home')).toBeInTheDocument()
    act(() => navigate('/teams'))
    await flush()
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })

  it('uses a fixed location when one is given', () => {
    const location = createMemoryHistory({initialEntries: ['/fixed']}).location
    act(() => history.replace('/elsewhere'))
    const {result} = renderHook(() => useRouter(), {
      wrapper: ({children}) => (
        <RouterProvider location={location}>{children}</RouterProvider>
      ),
    })
    expect(result.current.location?.pathname).toBe('/fixed')
  })
})

describe('useRouter', () => {
  const wrapper = ({children}: {children: ReactNode}) => (
    <RouterProvider>{children}</RouterProvider>
  )

  it('throws outside a RouterProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let caught: unknown
    try {
      renderHook(() => useRouter())
    } catch (error) {
      caught = error
    }
    expect(isAppError(caught) && caught.errorCode).toBe(
      'router.context_missing',
    )
  })

  it('parses the query string', () => {
    act(() => history.replace('/teams?page=2&search=fury'))
    const {result} = renderHook(() => useRouter(), {wrapper})
    expect(result.current.query).toEqual({page: '2', search: 'fury'})
  })

  it('go pushes, replace replaces, and both scroll to the top', () => {
    act(() => history.replace('/start'))
    const {result} = renderHook(() => useRouter(), {wrapper})
    act(() => result.current.go('/pushed'))
    expect(history.location.pathname).toBe('/pushed')
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
    act(() => result.current.replace('/replaced'))
    expect(history.location.pathname).toBe('/replaced')
    expect(scrollTo).toHaveBeenCalledTimes(2)
  })

  it('back returns to the previous entry', async () => {
    act(() => history.replace('/one'))
    act(() => navigate('/two'))
    const {result} = renderHook(() => useRouter(), {wrapper})
    const popped = new Promise<void>((resolve) => {
      const stop = history.listen(() => {
        stop()
        resolve()
      })
    })
    act(() => result.current.back())
    await popped
    expect(history.location.pathname).toBe('/one')
  })
})
