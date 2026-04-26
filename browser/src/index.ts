import {config} from '@browser/config'
import {injectGlobal} from '@emotion/css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'promise-polyfill/src/polyfill'
import {createElement as $, StrictMode} from 'react'
import ReactDOM from 'react-dom'
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
import {theme} from './theme'

// add title
document.title = config.title

// add favicon
const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
switch (config.leagueKey) {
  case 'marlow':
    favicon.href = marlowFavicon
    break
  case 'pul':
    favicon.href = pulFavicon
    break
}
document.head.appendChild(favicon)

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
})

ReactDOM.render(root, document.getElementById('root'))
