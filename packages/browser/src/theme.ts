import {hsla} from './utils/hsla'
/**
 *
 */
export const theme = {
  bgColor: hsla.string(0, 0, 100),
  bgHoverColor: hsla.string(0, 0, 90),
  bgPressColor: hsla.string(0, 0, 85),
  bgDisabledColor: hsla.string(0, 0, 85),
  borderColor: hsla.string(0, 0, 0),
  placeholderColor: hsla.string(0, 0, 65),
  labelColor: hsla.string(0, 0, 45),
  borderWidth: 2,
  inputPadding: 8,
  formPadding: 13,
  get border() {
    return `${this.borderWidth}px solid ${this.borderColor}`
  },
  padify(pixels: number = 3) {
    if (pixels < 3) throw new Error('Pixels must be greater than 3.')
    return `${pixels - 3}px ${pixels}px`
  },
}
