import {hsla} from './utils/hsla'
/**
 *
 */
export const theme = {
  color: hsla.string(0, 0, 0),
  minorColor: hsla.string(0, 0, 40),
  placeholderColor: hsla.string(0, 0, 50),
  borderColor: hsla.string(0, 0, 0),
  bgColor: hsla.string(0, 0, 100),
  bgMinorColor: hsla.string(0, 0, 95),
  bgHoverColor: hsla.string(0, 0, 90),
  bgPressColor: hsla.string(0, 0, 85),
  bgDisabledColor: hsla.string(0, 0, 85),
  bgAppColor: hsla.string(0, 0, 80),
  bgAdminColor: hsla.string(270, 100, 90),
  borderWidth: 2,
  inputPadding: 8,
  formPadding: 13,
  fontInset: 3,
  get border() {
    return `${this.borderWidth}px solid ${this.borderColor}`
  },
  padify(pixels: number) {
    if (pixels < this.fontInset)
      throw new Error('Pixels must be greater than 3.')
    return `${pixels - this.fontInset}px ${pixels}px`
  },
}
