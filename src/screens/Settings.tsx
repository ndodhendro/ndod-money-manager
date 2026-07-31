import { useState } from 'react'
import { CategoryManagePanel } from '../components/CategoryManagePanel'
import { clearStoredProfile, getStoredProfile } from '../lib/profile'
import { OWNER_LABELS, type TransactionType } from '../lib/types'

interface SettingsProps {
  onProfileReset: () => void
}

export function Settings({ onProfileReset }: SettingsProps) {
  const profile = getStoredProfile()
  const [manageType, setManageType] = useState<TransactionType>('expense')

  function handleChangeProfile() {
    if (!confirm('Ganti profil HP ini?')) return
    clearStoredProfile()
    onProfileReset()
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Pengaturan
      </h1>

      <div className="mt-5 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Profil HP ini
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {profile ? OWNER_LABELS[profile] : 'Belum dipilih'}
        </p>
        <button
          type="button"
          onClick={handleChangeProfile}
          className="mt-3 w-full rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100"
        >
          Ganti Profil
        </button>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Kelola Kategori
        </p>
        <CategoryManagePanel
          type={manageType}
          allowTypeChange
          onTypeChange={setManageType}
          onChanged={() => {}}
        />
      </div>

      <p className="mt-10 pb-2 text-center text-xs text-neutral-400 dark:text-neutral-500">
        Made by Ndod {'<3'}
      </p>
    </div>
  )
}
