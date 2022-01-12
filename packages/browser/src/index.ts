import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import 'whatwg-fetch'
import 'promise-polyfill/src/polyfill'
import ReactDOM from 'react-dom'
import {createElement as $, StrictMode} from 'react'
import {App} from './app/App'
import {AuthProvider} from './app/Auth/AuthProvider'
import {ToasterProvider} from './app/Toaster/ToasterProvider'
import {RouterProvider} from './app/Router/RouterProvider'
import {DepthProvider} from './app/Depth/DepthProvider'
import {MediaProvider} from './app/Media/MediaProvider'
/**
 *
 */
const root = $(StrictMode, {
  children: $(MediaProvider, {
    children: $(DepthProvider, {
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
