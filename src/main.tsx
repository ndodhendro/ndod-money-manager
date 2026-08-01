import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isDeviceUnlocked } from './lib/deviceUnlock'
import { prepareLaunchNumericKeyboard } from './lib/keyboardFocus'
import { getStoredProfile } from './lib/profile'
import { initPwaUpdate } from './lib/pwaUpdate'

initPwaUpdate()

// Cold start PWA: tangkap window aktivasi launch sedini mungkin supaya
// numpad siap sebelum splash selesai & QuickAdd mount.
const launchPath = window.location.hash.replace(/^#/, '') || '/'
const landsOnTambah =
  launchPath === '/' || launchPath === '' || launchPath.startsWith('/?')
if (isDeviceUnlocked() && getStoredProfile() && landsOnTambah) {
  prepareLaunchNumericKeyboard()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
