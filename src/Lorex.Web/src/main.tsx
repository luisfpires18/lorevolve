import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { watchTheme } from './lib/theme'
import { revealWhenReady } from './lib/launch'
import { registerServiceWorker } from './pwa'
import './styles.css'

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
