import { useState } from 'react'
import {
  HashRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { UpdateRequired } from './components/UpdateRequired'
import { getStoredProfile } from './lib/profile'
import { History } from './screens/History'
import { ProfilePicker } from './screens/ProfilePicker'
import { QuickAdd } from './screens/QuickAdd'
import { Settings } from './screens/Settings'
import { Summary } from './screens/Summary'

function App() {
  const [hasProfile, setHasProfile] = useState(() => Boolean(getStoredProfile()))

  return (
    <>
      <UpdateRequired />
      {!hasProfile ? (
        <ProfilePicker onPicked={() => setHasProfile(true)} />
      ) : (
        <HashRouter>
          <AppShell onProfileReset={() => setHasProfile(false)} />
        </HashRouter>
      )}
    </>
  )
}

function AppShell({ onProfileReset }: { onProfileReset: () => void }) {
  const location = useLocation()
  // Quick Add (buat baru) tetap di-mount; hanya "aktif" saat di route /.
  const createAddActive =
    location.pathname === '/' || location.pathname === ''

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div
        className={
          createAddActive
            ? 'block'
            : 'pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-0'
        }
        aria-hidden={!createAddActive}
      >
        <QuickAdd isActive={createAddActive} />
      </div>

      <Routes>
        <Route path="/" element={null} />
        <Route path="/transaksi/:id" element={<QuickAdd isActive />} />
        <Route path="/riwayat" element={<History />} />
        <Route path="/ringkasan" element={<Summary />} />
        <Route
          path="/pengaturan"
          element={<Settings onProfileReset={onProfileReset} />}
        />
      </Routes>
      <BottomNav />
    </div>
  )
}

export default App
