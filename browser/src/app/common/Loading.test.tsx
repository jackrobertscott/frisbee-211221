import {render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {Loading} from './Loading'

const revealDelay = () => screen.getByRole('status', {name: 'Loading teams'}).style.animationDelay

describe('Loading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.advanceTimersByTime(10_000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits a second before revealing a fresh spinner', () => {
    render(<Loading label="Loading teams" />)
    expect(revealDelay()).toBe('1000ms')
  })

  it('counts the next stage of a load from when the load started', () => {
    const first = render(<Loading label="Loading teams" />)
    vi.advanceTimersByTime(300)
    first.unmount()
    vi.advanceTimersByTime(20)
    render(<Loading label="Loading teams" />)
    expect(revealDelay()).toBe('680ms')
  })

  it('shows a later stage straight away once the load has been slow', () => {
    const first = render(<Loading label="Loading teams" />)
    vi.advanceTimersByTime(1500)
    first.unmount()
    render(<Loading label="Loading teams" />)
    expect(revealDelay()).toBe('0ms')
  })

  it('starts a new load after a gap', () => {
    const first = render(<Loading label="Loading teams" />)
    vi.advanceTimersByTime(1500)
    first.unmount()
    vi.advanceTimersByTime(500)
    render(<Loading label="Loading teams" />)
    expect(revealDelay()).toBe('1000ms')
  })
})
