import {hsla} from './utils/hsla'
/**
 *
 */
export const theme = {
  fib: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597],
  font: hsla.create(0, 0, 0, 0.75),
  fontComplement: hsla.create(0, 0, 100, 0.9),
  fontMinor: hsla.create(0, 0, 0, 0.5),
  fontPlaceholder: hsla.create(0, 0, 0, 0.35),
  bg: hsla.create(0, 0, 100),
  bgMinor: hsla.create(0, 0, 95),
  bgRoot: hsla.create(0, 0, 90),
  bgDisabled: hsla.create(0, 0, 85),
  bgHighlight: hsla.create(60, 100, 85),
  bgAdmin: hsla.create(270, 100, 95),
  borderColor: hsla.create(0, 0, 75),
  borderWidth: 1,
  fontInset: 3,
  fontSizeMinor: 14,
  fontSizeMajor: 21,
  dateFormat: 'D MMM YYYY h:mma',
  border() {
    return `${this.borderWidth}px solid ${this.borderColor.string()}`
  },
  padify(pixels: number) {
    if (pixels < this.fontInset)
      throw new Error('Pixels must be greater than 3.')
    return `${pixels - this.fontInset}px ${pixels}px`
  },
  gtMedia(pixels: number) {
    return `@media (min-width: ${pixels}px)`
  },
  ltMedia(pixels: number) {
    return `@media (max-width: ${pixels - 1}px)`
  },
}
