import {config} from '@browser/config'
import {injectGlobal} from '@emotion/css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'promise-polyfill/src/polyfill'
import {createElement as $, StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import 'whatwg-fetch'
import {App} from './app/App'
import {AuthProvider} from './app/Auth/AuthProvider'
import {MediaProvider} from './app/Media/MediaProvider'
import {RouterProvider} from './app/Router/RouterProvider'
import {StackProvider} from './app/Stack/StackProvider'
import {ToasterProvider} from './app/Toaster/ToasterProvider'
import marlowFavicon from './assets/marlow-favicon.ico'
import pulFavicon from './assets/pul-favicon.ico'
import './index.css'
import {THEME_STORAGE_KEY, ThemeProvider, theme} from './theme'
import {local} from './utils/local'

// add title
document.title = config.title

// add favicon
const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/x-icon'
switch (config.leagueKey) {
  case 'marlow':
    favicon.href = marlowFavicon
    break
  case 'pul':
    favicon.href = pulFavicon
    break
}
document.head.appendChild(favicon)

document.documentElement.dataset.theme = local.get(THEME_STORAGE_KEY) ?? 'light'

// add global styles
// override the CSS fallback font-family with the themed font
injectGlobal({
  body: {
    fontFamily: theme.fontFamily,
    backgroundColor: theme.bgRoot.string(),
    color: theme.font.string(),
  },
})

const root = $(StrictMode, {
  children: $(ThemeProvider, {
    children: $(MediaProvider, {
      children: $(StackProvider, {
        children: $(ToasterProvider, {
          children: $(AuthProvider, {
            children: $(RouterProvider, {
              children: $(App),
            }),
          }),
        }),
      }),
    }),
  }),
})

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container not found')
}

createRoot(container).render(root)
