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
import './index.css'
import {theme} from './theme'

injectGlobal({
  body: {
    backgroundColor: theme.bgRoot.string(),
    color: theme.font.string(),
  },
})

/**
 *
 */
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
/**
 *
 */
ReactDOM.render(root, document.getElementById('root'))
