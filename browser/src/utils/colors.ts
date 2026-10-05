import {hsla} from './hsla'

const HUES = Array.from({length: 12}, (_, index) => index * 30)

/** The only colours the server accepts for teams: light, mid and full tones of 12 hues, then four greys. */
export const TEAM_COLORS: string[] = [
  ...HUES.flatMap((h) => [hsla(h, 100, 80), hsla(h, 100, 65), hsla(h, 100, 50)]),
  hsla(0, 0, 100),
  hsla(0, 0, 70),
  hsla(0, 0, 40),
  hsla(0, 0, 20),
]
