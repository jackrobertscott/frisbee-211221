export const hsla = {
  /**
   *
   */
  string(
    hue: number = 0,
    saturation: number = 0,
    lightness: number = 0,
    alpha: number = 1
  ) {
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`
  },
  /**
   *
   */
  object(h: number = 0, s: number = 0, l: number = 0, a: number = 1) {
    return {h, s, l, a}
  },
  /**
   *
   */
  digest(value: string): THSLA {
    const data = value.match(this.regex)
    const [_, _h = 0, _s = 50, _l = 50, _a = 1] = data || []
    const [h, s, l, a] = [_h, _s, _l, _a].map((i) => parseFloat(i.toString()))
    return {h, s, l, a}
  },
  /**
   *
   */
  render({h, s, l, a}: THSLA) {
    return this.string(h, s, l, a)
  },
  /**
   *
   */
  validate(value: string) {
    return this.regex.test(value)
  },
  /**
   *
   */
  lighten(percent: number, color?: THSLA): THSLA {
    if (!color) return {h: 0, s: 0, l: 100, a: percent / 100}
    if (color.a >= 1) return this.merge(color, {l: percent})
    return this.merge(color, {a: percent / 100})
  },
  /**
   *
   */
  darken(percent: number, color?: THSLA): THSLA {
    if (!color) return {h: 0, s: 0, l: 0, a: percent / 100}
    if (color.a >= 1) return this.merge(color, {l: -percent})
    return this.merge(color, {a: -percent / 100})
  },
  /**
   *
   */
  merge(primary: THSLA, secondary: Partial<THSLA>): THSLA {
    return {
      h: primary.h + (secondary?.h ?? 0),
      s: primary.s + (secondary?.s ?? 0),
      l: primary.l + (secondary?.l ?? 0),
      a: primary.a + (secondary?.a ?? 0),
    }
  },
  /**
   *
   */
  regex: /^hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*(\d*(?:\.\d+)?)\)$/,
}
/**
 *
 */
export interface THSLA {
  h: number
  s: number
  l: number
  a: number
}
