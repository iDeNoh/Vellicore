import React from 'react'
import ReactDOM from 'react-dom/client'
import { enableMapSet } from 'immer'
import App from './App.jsx'
import './styles/globals.css'

// Required for Immer to handle Map and Set in Zustand store
enableMapSet()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
