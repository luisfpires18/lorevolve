import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { watchTheme } from './lib/theme'
import { revealWhenReady } from './lib/launch'
import { registerServiceWorker } from './pwa'
import './styles.css'

// A chunk preloaded for the next screen is gone because LorEvolve was redeployed: reload once to fetch the new build. The
// guard stops a loop if the reload itself cannot load it; the route's error screen covers that case.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('lorevolve:reloaded-for-update')) return
    sessionStorage.setItem('lorevolve:reloaded-for-update', '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

watchTheme()
registerServiceWorker()
revealWhenReady()
