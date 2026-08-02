import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isDeviceUnlocked } from './lib/deviceUnlock'
import { prepareLaunchNumericKeyboard } from './lib/keyboardFocus'
import { getStoredProfile } from './lib/profile'
import { initPwaUpdate } from './lib/pwaUpdate'

initPwaUpdate()

// Cold start PWA: numpad hanya kalau land langsung di layar Tambah (shortcut).
const launchPath = window.location.hash.replace(/^#/, '') || '/'
const landsOnTambah =
  launchPath === '/tambah' || launchPath.startsWith('/tambah?')
if (isDeviceUnlocked() && getStoredProfile() && landsOnTambah) {
  prepareLaunchNumericKeyboard()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
