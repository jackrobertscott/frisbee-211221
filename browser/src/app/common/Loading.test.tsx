import {render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {Loading} from './Loading'

const spinner = () => screen.getByRole('status', {name: 'Loading teams'})

describe('Loading', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits before revealing a fresh spinner', () => {
    vi.useFakeTimers()
    vi.advanceTimersByTime(10_000)
    render(<Loading label="Loading teams" />)
    expect(spinner()).toHaveClass('fr-loading--pending')
  })

  it('shows the next stage straight away when a visible spinner hands over', () => {
    vi.useFakeTimers()
    vi.advanceTimersByTime(10_000)
    const first = render(<Loading label="Loading teams" />)
    vi.advanceTimersByTime(300)
    first.unmount()
    vi.advanceTimersByTime(20)
    render(<Loading label="Loading teams" />)
    expect(spinner()).not.toHaveClass('fr-loading--pending')
  })

  it('keeps the delay when the previous spinner never appeared', () => {
    vi.useFakeTimers()
    vi.advanceTimersByTime(10_000)
    const first = render(<Loading label="Loading teams" />)
    vi.advanceTimersByTime(100)
    first.unmount()
    render(<Loading label="Loading teams" />)
    expect(spinner()).toHaveClass('fr-loading--pending')
  })
})
