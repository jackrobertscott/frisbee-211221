import {hsla} from './utils/hsla'
/**
 *
 */
export const theme = {
  black: hsla.string(0, 0, 0),
  white: hsla.string(0, 0, 100),
  whiteHover: hsla.string(0, 0, 90),
  whiteActive: hsla.string(0, 0, 85),
  get border() {
    return `2px solid ${this.black}`
  },
  padify(pixels: number = 3) {
    if (pixels < 3) throw new Error('Pixels must be greater than 3.')
    return `${pixels - 3}px ${pixels}px`
  },
}
