import {afterEach, describe, expect, it, vi} from 'vitest'
import {downloadBlob} from './download'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('downloadBlob', () => {
  it('clicks a hidden link to save the blob, then cleans up', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:http://client.test/1')
    const revokeObjectURL = vi.fn((_url: string) => undefined)
    vi.stubGlobal('URL', {...URL, createObjectURL, revokeObjectURL})
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this)
      expect(document.body.contains(this)).toBe(true)
    })
    const blob = new Blob(['a,b'], {type: 'text/csv'})

    downloadBlob(blob, 'export.csv')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked).toHaveLength(1)
    const [anchor] = clicked
    expect(anchor.href).toBe('blob:http://client.test/1')
    expect(anchor.download).toBe('export.csv')
    expect(anchor.rel).toBe('noopener')
    expect(anchor.style.display).toBe('none')
    expect(document.body.contains(anchor)).toBe(false)

    vi.advanceTimersByTime(59_999)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://client.test/1')
  })
})
