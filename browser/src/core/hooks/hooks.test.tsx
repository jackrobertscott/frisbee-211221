import {act, renderHook, waitFor} from '@testing-library/react'
import {ReactNode} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {history} from '../router/history'
import {navigate} from '../router/navigate'
import {RouterProvider} from '../router/RouterProvider'
import {storage} from '../storage'
import {useLoad} from './useLoad'
import {useLocalState} from './useLocalState'
import {useMountedRef} from './useMountedRef'
import {useReload} from './useReload'

/** A promise whose settlement the test controls. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useLoad', () => {
  it('loads on mount and exposes the result', async () => {
    const load = vi.fn(async () => ['a'])
    const {result} = renderHook(() => useLoad(load, []))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(['a'])
    expect(result.current.failed).toBe(false)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('marks failures without throwing and recovers on reload', async () => {
    let fail = true
    const {result} = renderHook(() =>
      useLoad(async () => {
        if (fail) throw new Error('nope')
        return 'ok'
      }, []),
    )
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeUndefined()
    fail = false
    await act(async () => {
      await expect(result.current.reload()).resolves.toBe('ok')
    })
    expect(result.current.failed).toBe(false)
    expect(result.current.data).toBe('ok')
  })

  it('reloads with the latest loader when deps change', async () => {
    const {result, rerender} = renderHook(
      ({page}) => useLoad(async () => `page ${page}`, [page]),
      {initialProps: {page: 1}},
    )
    await waitFor(() => expect(result.current.data).toBe('page 1'))
    rerender({page: 2})
    await waitFor(() => expect(result.current.data).toBe('page 2'))
  })

  it('ignores stale responses from superseded deps', async () => {
    const slow = deferred<string>()
    const fast = deferred<string>()
    const {result, rerender} = renderHook(
      ({search}) =>
        useLoad(() => (search === 'a' ? slow.promise : fast.promise), [search]),
      {initialProps: {search: 'a'}},
    )
    rerender({search: 'ab'})
    await act(async () => fast.resolve('results ab'))
    expect(result.current.data).toBe('results ab')
    expect(result.current.loading).toBe(false)
    await act(async () => slow.resolve('results a'))
    expect(result.current.data).toBe('results ab')
  })

  it('ignores stale failures from superseded deps', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const {result, rerender} = renderHook(
      ({n}) => useLoad(() => (n === 1 ? first.promise : second.promise), [n]),
      {initialProps: {n: 1}},
    )
    rerender({n: 2})
    await act(async () => second.resolve('two'))
    await act(async () => first.reject(new Error('late')))
    expect(result.current.failed).toBe(false)
    expect(result.current.data).toBe('two')
  })

  it('set overrides the loaded data locally', async () => {
    const {result} = renderHook(() => useLoad(async () => 1, []))
    await waitFor(() => expect(result.current.data).toBe(1))
    act(() => result.current.set(5))
    expect(result.current.data).toBe(5)
  })
})

describe('useLocalState', () => {
  it('prefers the stored value over the default', () => {
    storage.set('k', 'stored')
    const {result} = renderHook(() => useLocalState('k', 'default'))
    expect(result.current[0]).toBe('stored')
  })

  it('uses a default value or initializer when nothing is stored', () => {
    const init = vi.fn(() => ({n: 1}))
    const {result} = renderHook(() => useLocalState('k', init))
    expect(result.current[0]).toEqual({n: 1})
    expect(init).toHaveBeenCalledTimes(1)
    expect(storage.get('k')).toEqual({n: 1})
  })

  it('persists updates and removes the key when cleared', () => {
    const {result} = renderHook(() => useLocalState<string | undefined>('k'))
    expect(storage.has('k')).toBe(false)
    act(() => result.current[1]('saved'))
    expect(storage.get('k')).toBe('saved')
    act(() => result.current[1](undefined))
    expect(storage.has('k')).toBe(false)
  })

  it('treats falsy values as cleared in storage', () => {
    const {result, unmount} = renderHook(() => useLocalState('k', 'x'))
    act(() => result.current[1](''))
    expect(storage.has('k')).toBe(false)
    unmount()
    // so a remount falls back to the default rather than the empty string
    const again = renderHook(() => useLocalState('k', 'x'))
    expect(again.result.current[0]).toBe('x')
  })
})

describe('useMountedRef', () => {
  it('is true while mounted and false after unmount', () => {
    const {result, unmount} = renderHook(() => useMountedRef())
    const ref = result.current
    expect(ref.current).toBe(true)
    unmount()
    expect(ref.current).toBe(false)
  })
})

describe('useReload', () => {
  const wrapper = ({children}: {children: ReactNode}) => (
    <RouterProvider>{children}</RouterProvider>
  )

  const setup = () => {
    const reload = vi.fn()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    act(() => history.replace('/start'))
    renderHook(() => useReload(), {wrapper})
    // Live view of the real location (history reads it) with a fake reload.
    const real = window.location
    vi.stubGlobal('location', {
      get pathname() {
        return real.pathname
      },
      get search() {
        return real.search
      },
      get hash() {
        return real.hash
      },
      get href() {
        return real.href
      },
      reload,
    })
    return reload
  }

  const go = async (path: string) => {
    act(() => navigate(path))
    await act(() => vi.advanceTimersByTimeAsync(1))
  }

  it('reloads the app after many in-app navigations', async () => {
    vi.useFakeTimers()
    const reload = setup()
    for (let i = 1; i < 49; i++) await go(`/page/${i}`)
    expect(reload).not.toHaveBeenCalled()
    await go('/page/49')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads on the next navigation once the app is an hour old', async () => {
    vi.useFakeTimers()
    const reload = setup()
    await act(() => vi.advanceTimersByTimeAsync(1000 * 60 * 60))
    expect(reload).not.toHaveBeenCalled()
    await go('/later')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
