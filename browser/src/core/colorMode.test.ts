import {act, renderHook, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'
import {applyStoredColorMode, useColorMode} from './colorMode'
import {storage} from './storage'

const KEY = 'frisbee.theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('applyStoredColorMode', () => {
  it('defaults to light', () => {
    applyStoredColorMode()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('applies the stored preference from the previous theme key', () => {
    storage.set(KEY, 'dark')
    applyStoredColorMode()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('useColorMode', () => {
  it('reads the current document mode', () => {
    document.documentElement.dataset.theme = 'dark'
    const {result} = renderHook(() => useColorMode())
    expect(result.current[0]).toBe('dark')
  })

  it('treats unknown themes as light', () => {
    document.documentElement.dataset.theme = 'sepia'
    const {result} = renderHook(() => useColorMode())
    expect(result.current[0]).toBe('light')
  })

  it('toggles the document mode and remembers the choice', async () => {
    const {result} = renderHook(() => useColorMode())
    expect(result.current[0]).toBe('light')
    act(() => result.current[1]())
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(storage.get(KEY)).toBe('dark')
    await waitFor(() => expect(result.current[0]).toBe('dark'))
    act(() => result.current[1]())
    expect(storage.get(KEY)).toBe('light')
    await waitFor(() => expect(result.current[0]).toBe('light'))
  })

  it('follows theme changes made elsewhere', async () => {
    const {result} = renderHook(() => useColorMode())
    act(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await waitFor(() => expect(result.current[0]).toBe('dark'))
  })
})
