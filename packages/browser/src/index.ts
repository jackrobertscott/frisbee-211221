import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import 'whatwg-fetch'
import 'promise-polyfill/src/polyfill'
import ReactDOM from 'react-dom'
import {createElement as $, StrictMode} from 'react'
import {App} from './app/App'
import {AuthProvider} from './app/Auth/AuthProvider'
import {ToasterProvider} from './app/Toaster/ToasterProvider'
/**
 *
 */
const root = $(StrictMode, {
  children: $(ToasterProvider, {
    children: $(AuthProvider, {
      children: $(App),
    }),
  }),
})
/**
 *
 */
ReactDOM.render(root, document.getElementById('root'))
