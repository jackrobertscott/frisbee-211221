import {hsla} from './hsla'
/**
 *
 */
export const SIMPLE_COLORS = new Array(12)
  .fill(0)
  .flatMap((_, index) => [
    hsla.create(index * 30, 100, 85),
    hsla.create(index * 30, 100, 65),
    hsla.create(index * 30, 100, 45),
  ])
  .concat([
    hsla.create(0, 0, 100),
    hsla.create(0, 0, 70),
    hsla.create(0, 0, 40),
    hsla.create(0, 0, 20),
  ])
