import React from 'react'
import ReactDOM from 'react-dom/client'
import { enableMapSet } from 'immer'
import App from './App.jsx'
import './styles/globals.css'

// Required for Immer to handle Map and Set in Zustand store
enableMapSet()

// crypto.randomUUID() requires a secure context (HTTPS/localhost).
// On LAN access over plain HTTP, patch it with a getRandomValues-based fallback.
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  crypto.randomUUID = function () {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
