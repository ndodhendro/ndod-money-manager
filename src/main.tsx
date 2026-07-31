import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPwaUpdate } from './lib/pwaUpdate'

initPwaUpdate()

const splashStartedAt = performance.now()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

function hideSplash() {
  const splash = document.getElementById('app-splash')
  if (!splash) return

  // Sedikit jeda minimum supaya label "Ndod Budget" sempat terbaca, tanpa
  // memperlambat input secara terasa.
  const minVisibleMs = 280
  const wait = Math.max(0, minVisibleMs - (performance.now() - splashStartedAt))

  window.setTimeout(() => {
    splash.classList.add('is-hidden')
    window.setTimeout(() => splash.remove(), 200)
  }, wait)
}

hideSplash()
