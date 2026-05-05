import {theme} from '../theme'

type THSLAChannel = number | string

const withUnit = (value: THSLAChannel, unit: string = '') => {
  if (typeof value === 'number') return `${value}${unit}`
  return value
}

const shift = (value: THSLAChannel, amount: number, unit: string = '') => {
  if (typeof value === 'number') return value + amount
  const operator = amount >= 0 ? '+' : '-'
  return `calc(${value} ${operator} ${Math.abs(amount)}${unit})`
}

const createColor = (
  {
    h,
    s,
    l,
    a,
  }: {h: THSLAChannel; s: THSLAChannel; l: THSLAChannel; a: THSLAChannel},
  compliment?: () => THSLA,
): THSLA => ({
  h,
  s,
  l,
  a,
  string() {
    return `hsla(${withUnit(h)}, ${withUnit(s, '%')}, ${withUnit(l, '%')}, ${withUnit(a)})`
  },
  object() {
    return {h, s, l, a}
  },
  lighten(percent: number) {
    if (typeof a === 'number' && a < 1)
      return createColor({h, s, l, a: shift(a, percent / 100)}, compliment)
    return createColor({h, s, l: shift(l, percent, '%'), a}, compliment)
  },
  darken(percent: number) {
    if (typeof a === 'number' && a < 1)
      return createColor({h, s, l, a: shift(a, -percent / 100)}, compliment)
    return createColor({h, s, l: shift(l, -percent, '%'), a}, compliment)
  },
  merge(i: {h?: number; s?: number; l?: number; a?: number}) {
    return createColor(
      {
        h: shift(h, i.h ?? 0),
        s: shift(s, i.s ?? 0, '%'),
        l: shift(l, i.l ?? 0, '%'),
        a: shift(a, i.a ?? 0),
      },
      compliment,
    )
  },
  hover() {
    return this.darken(5).string()
  },
  press() {
    return this.darken(15).string()
  },
  compliment() {
    if (compliment) return compliment()
    let definitelyLight = false
    const hue = typeof h === 'number' ? h : 0
    const lightness = typeof l === 'number' ? l : 0
    if (hue < 60) definitelyLight = lightness >= 50
    if (hue >= 60 && hue < 210) definitelyLight = lightness >= 50
    if (hue >= 210 && hue < 300) definitelyLight = lightness >= 70
    if (hue >= 300) definitelyLight = lightness >= 50
    return definitelyLight ? theme.fontContrastDark : theme.fontContrastLight
  },
})

export const hsla = {
  create(h: number = 0, s: number = 0, l: number = 0, a: number = 1) {
    return createColor({h, s, l, a})
  },

  variable(name: string, compliment?: string): THSLA {
    return createColor(
      {
        h: `var(--theme-${name}-h)`,
        s: `var(--theme-${name}-s)`,
        l: `var(--theme-${name}-l)`,
        a: `var(--theme-${name}-a)`,
      },
      compliment ? (): THSLA => hsla.variable(compliment) : undefined,
    )
  },

  string(h: number = 0, s: number = 0, l: number = 0, a: number = 1) {
    return `hsla(${h}, ${s}%, ${l}%, ${a})`
  },

  digest(value: string) {
    const data = value.match(this.regex)
    const [_, _h = 0, _s = 50, _l = 50, _a = 1] = data || []
    const [h, s, l, a] = [_h, _s, _l, _a].map((i) => parseFloat(i.toString()))
    return this.create(h, s, l, a)
  },

  validate(value: string) {
    return this.regex.test(value)
  },

  regex: /^hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*(\d*(?:\.\d+)?)\)$/,
}

export interface THSLA {
  h: THSLAChannel
  s: THSLAChannel
  l: THSLAChannel
  a: THSLAChannel
  string(): string
  object(): {
    h: THSLAChannel
    s: THSLAChannel
    l: THSLAChannel
    a: THSLAChannel
  }
  lighten(percent: number): THSLA
  darken(percent: number): THSLA
  merge(i: {h?: number; s?: number; l?: number; a?: number}): THSLA
  hover(): string
  press(): string
  compliment(): THSLA
}
