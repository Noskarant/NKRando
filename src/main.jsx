import React from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import './bergfex-ui.css'
import App from './App'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache:'none' })
      reg.update().catch(() => {})
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (sessionStorage.getItem('nkrando-sw-reloaded') === '1') return
        sessionStorage.setItem('nkrando-sw-reloaded', '1')
        window.location.reload()
      })
    } catch {}
  })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
