import {hsla} from './utils/hsla'
/**
 *
 */
export const theme = {
  fib: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597],
  font: hsla.create(0, 0, 0),
  fontMinor: hsla.create(0, 0, 40),
  fontPlaceholder: hsla.create(0, 0, 50),
  fontHighlight: hsla.create(0, 0, 100),
  bg: hsla.create(0, 0, 100),
  bgMinor: hsla.create(0, 0, 95),
  bgHighlight: hsla.create(210, 100, 55),
  bgDisabled: hsla.create(0, 0, 90),
  bgApp: hsla.create(0, 0, 80),
  bgAdmin: hsla.create(270, 100, 90),
  borderColor: hsla.create(0, 0, 0),
  borderWidth: 2,
  fontInset: 3,
  fontSizeMinor: 14,
  dateFormat: 'D MMM YYYY h:mma',
  border() {
    return `${this.borderWidth}px solid ${this.borderColor.string()}`
  },
  padify(pixels: number) {
    if (pixels < this.fontInset)
      throw new Error('Pixels must be greater than 3.')
    return `${pixels - this.fontInset}px ${pixels}px`
  },
}
