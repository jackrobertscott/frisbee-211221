import {ioTeam} from '@shared/schemas/ioTeam'
import {describe, expect, it} from 'vitest'
import {TEAM_COLORS} from './colors'
import {hsla} from './hsla'

describe('hsla', () => {
  it('formats channels with units and an opaque default alpha', () => {
    expect(hsla(210, 100, 65)).toBe('hsla(210, 100%, 65%, 1)')
    expect(hsla(0, 0, 10, 0.94)).toBe('hsla(0, 0%, 10%, 0.94)')
  })
})

describe('TEAM_COLORS', () => {
  it('keeps the exact strings already stored on teams', () => {
    const tones = (h: number) => [
      `hsla(${h}, 100%, 80%, 1)`,
      `hsla(${h}, 100%, 65%, 1)`,
      `hsla(${h}, 100%, 50%, 1)`,
    ]
    expect(TEAM_COLORS).toEqual([
      ...[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].flatMap(tones),
      'hsla(0, 0%, 100%, 1)',
      'hsla(0, 0%, 70%, 1)',
      'hsla(0, 0%, 40%, 1)',
      'hsla(0, 0%, 20%, 1)',
    ])
  })

  it('matches the format the server accepts', () => {
    const serverHsla =
      /^hsla\(\s*(-?\d+(?:\.\d+)?)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*(\d*(?:\.\d+)?)\s*\)$/
    for (const color of TEAM_COLORS) expect(color).toMatch(serverHsla)
  })

  it('passes the shared team colour validator unchanged', () => {
    for (const color of TEAM_COLORS)
      expect(ioTeam.shape.color.validate(color)).toEqual({
        ok: true,
        value: color,
      })
  })

  it('has no duplicates', () => {
    expect(new Set(TEAM_COLORS).size).toBe(TEAM_COLORS.length)
  })
})
