import { useState } from 'react'
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AppToast } from './components/AppToast'
import { BottomNav } from './components/BottomNav'
import { UpdateRequired } from './components/UpdateRequired'
import { useBackButtonTrap } from './hooks/useBackButton'
import { isDeviceUnlocked } from './lib/deviceUnlock'
import { getStoredProfile } from './lib/profile'
import { History } from './screens/History'
import { MoneyPlanScreen } from './screens/MoneyPlan'
import { PinUnlock } from './screens/PinUnlock'
import { ProfilePicker } from './screens/ProfilePicker'
import { QuickAdd } from './screens/QuickAdd'
import { Settings } from './screens/Settings'
import { Dashboard } from './screens/Dashboard'

function App() {
  const [unlocked, setUnlocked] = useState(() => isDeviceUnlocked())
  const [hasProfile, setHasProfile] = useState(() => Boolean(getStoredProfile()))

  return (
    <>
      <UpdateRequired />
      {!unlocked ? (
        <PinUnlock onUnlocked={() => setUnlocked(true)} />
      ) : !hasProfile ? (
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
  useBackButtonTrap()

  // Quick Add (buat baru) tetap di-mount; aktif hanya di /tambah.
  const createAddActive = location.pathname === '/tambah'

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
        <Route path="/" element={<Navigate to="/riwayat" replace />} />
        <Route path="/tambah" element={null} />
        <Route path="/transaksi/:id" element={<QuickAdd isActive />} />
        <Route path="/riwayat" element={<History />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/rencana" element={<MoneyPlanScreen />} />
        <Route path="/ringkasan" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/pengaturan"
          element={<Settings onProfileReset={onProfileReset} />}
        />
      </Routes>
      <BottomNav />
      <AppToast />
    </div>
  )
}

export default App
