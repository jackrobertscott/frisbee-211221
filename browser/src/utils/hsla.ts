/** CSS colour string in the `hsla(h, s%, l%, a)` format the server accepts. */
export const hsla = (h: number, s: number, l: number, a = 1) =>
  `hsla(${h}, ${s}%, ${l}%, ${a})`
