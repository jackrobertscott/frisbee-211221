import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import 'promise-polyfill/src/polyfill'
import 'whatwg-fetch'
import '@ui'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {App} from './app/App'
import './app/app.css'
import marlowFavicon from './assets/marlow-favicon.ico'
import pulFavicon from './assets/pul-favicon.ico'
import {config} from './config'
import {AuthProvider} from './core/auth/AuthProvider'
import {RouterProvider} from './core/router/RouterProvider'
import {applyStoredColorMode} from './core/colorMode'

document.title = config.title

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/x-icon'
favicon.href = config.leagueKey === 'marlow' ? marlowFavicon : pulFavicon
document.head.appendChild(favicon)

applyStoredColorMode()

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AuthProvider>
  </StrictMode>,
)
