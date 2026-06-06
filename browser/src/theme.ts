import {internalError} from '@shared/errors'
import type {CSSObject} from '@emotion/css/dist/declarations/src/create-instance'
import {
  createContext,
  createElement as $,
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
} from 'react'
import {useLocalState} from './app/useLocalState'
import {hsla} from './utils/hsla'

const THEME_FIB = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597,
]
const CELL_PADDING_DEFAULT = THEME_FIB[5]

export type TThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'frisbee.theme'

const ThemeContext = createContext<{
  current: TThemeMode
  currentSet: Dispatch<SetStateAction<TThemeMode>>
  toggle: () => void
}>({
  current: 'light',
  currentSet: () => undefined,
  toggle: () => undefined,
})

export const ThemeProvider: FC<{
  children: ReactNode
}> = ({children}) => {
  const [current, currentSet] = useLocalState<TThemeMode>(
    THEME_STORAGE_KEY,
    'light',
  )
  const applied = current ?? 'light'
  useEffect(() => {
    document.documentElement.dataset.theme = applied
  }, [applied])
  return $(ThemeContext.Provider, {
    value: {
      current: applied,
      currentSet,
      toggle: () =>
        currentSet((i) => {
          return i === 'dark' ? 'light' : 'dark'
        }),
    },
    children,
  })
}

export const useTheme = () => useContext(ThemeContext)

const color = (name: string, compliment?: string) => hsla.variable(name, compliment)

export const theme = {
  fib: THEME_FIB,
  fontFamily: 'Atkinson Hyperlegible Next',
  font: color('font'),
  fontComplement: color('font-complement'),
  fontContrastLight: color('font-contrast-light'),
  fontContrastDark: color('font-contrast-dark'),
  fontMinor: color('font-minor'),
  fontPlaceholder: color('font-placeholder'),
  bg: color('bg', 'bg-compliment'),
  bgMinor: color('bg-minor', 'bg-minor-compliment'),
  bgRoot: color('bg-root'),
  bgDisabled: color('bg-disabled', 'bg-disabled-compliment'),
  bgHighlight: color('bg-highlight', 'bg-highlight-compliment'),
  bgAdmin: color('bg-admin', 'bg-admin-compliment'),
  bgAdminButton: color('bg-admin-button', 'bg-admin-button-compliment'),
  borderColor: color('border-color'),
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
      throw internalError('Pixels must be greater than 3.', {
        errorCode: 'theme.padify_pixels_invalid',
      })
    return `${pixels - this.fontInset}px ${pixels}px`
  },
  cellPadding(pixels: number = CELL_PADDING_DEFAULT): CSSObject {
    return {
      padding: this.padify(pixels),
    }
  },
  gtMedia(pixels: number) {
    return `@media (min-width: ${pixels}px)`
  },
  ltMedia(pixels: number) {
    return `@media (max-width: ${pixels - 1}px)`
  },
}
