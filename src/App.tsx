import { useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { getStoredProfile } from './lib/profile'
import { History } from './screens/History'
import { ProfilePicker } from './screens/ProfilePicker'
import { QuickAdd } from './screens/QuickAdd'
import { Settings } from './screens/Settings'
import { Summary } from './screens/Summary'

function App() {
  const [hasProfile, setHasProfile] = useState(() => Boolean(getStoredProfile()))

  if (!hasProfile) {
    return <ProfilePicker onPicked={() => setHasProfile(true)} />
  }

  return (
    <HashRouter>
      <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
        <Routes>
          <Route path="/" element={<QuickAdd />} />
          <Route path="/transaksi/:id" element={<QuickAdd />} />
          <Route path="/riwayat" element={<History />} />
          <Route path="/ringkasan" element={<Summary />} />
          <Route
            path="/pengaturan"
            element={<Settings onProfileReset={() => setHasProfile(false)} />}
          />
        </Routes>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

export default App
