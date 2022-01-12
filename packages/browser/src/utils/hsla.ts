export const hsla = {
  /**
   *
   */
  create(h: number = 0, s: number = 0, l: number = 0, a: number = 1) {
    return {
      h,
      s,
      l,
      a,
      string() {
        return `hsla(${h}, ${s}%, ${l}%, ${a})`
      },
      object() {
        return {h, s, l, a}
      },
      lighten(percent: number) {
        if (a >= 1) return hsla.create(h, s, l + percent, a)
        return hsla.create(h, s, l, a + percent / 100)
      },
      darken(percent: number) {
        if (a >= 1) return hsla.create(h, s, l - percent, a)
        return hsla.create(h, s, l, a - percent / 100)
      },
      merge(i: {h?: number; s?: number; l?: number; a?: number}) {
        return hsla.create(
          h + (i.h ?? 0),
          s + (i.s ?? 0),
          l + (i.l ?? 0),
          a + (i.a ?? 0)
        )
      },
      hover() {
        return this.darken(10).string()
      },
      press() {
        return this.darken(15).string()
      },
      compliment() {
        return this.l < 55 ? hsla.create(0, 0, 100) : undefined
      },
    }
  },
  /**
   *
   */
  string(h: number = 0, s: number = 0, l: number = 0, a: number = 1) {
    return `hsla(${h}, ${s}%, ${l}%, ${a})`
  },
  /**
   *
   */
  digest(value: string) {
    const data = value.match(this.regex)
    const [_, _h = 0, _s = 50, _l = 50, _a = 1] = data || []
    const [h, s, l, a] = [_h, _s, _l, _a].map((i) => parseFloat(i.toString()))
    return this.create(h, s, l, a)
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
  regex: /^hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*(\d*(?:\.\d+)?)\)$/,
}
/**
 *
 */
export type THSLA = ReturnType<typeof hsla.create>
