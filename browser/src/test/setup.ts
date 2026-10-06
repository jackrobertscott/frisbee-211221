import './polyfills'
import '@testing-library/jest-dom/vitest'
import {cleanup} from '@testing-library/react'
import {afterEach, beforeEach, vi} from 'vitest'
import {pageLoad} from '../core/router/navigate'

beforeEach(() => {
  pageLoad.at = Date.now()
  pageLoad.changes = 0
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})
