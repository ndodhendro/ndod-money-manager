import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { OwnerBadge } from '../components/OwnerBadge'
import { PageTitle } from '../components/PageTitle'
import { SettingsNavRow } from '../components/SettingsNavRow'
import { APP_VERSION } from '../lib/branding'
import { NavIcon } from '../lib/navTabs'
import { clearStoredProfile, getStoredProfile } from '../lib/profile'
import { SETTINGS_SECTIONS } from '../lib/settingsSections'

interface SettingsProps {
  onProfileReset: () => void
}

export function Settings({ onProfileReset }: SettingsProps) {
  const profile = getStoredProfile()
  const [changeProfileOpen, setChangeProfileOpen] = useState(false)

  function confirmChangeProfile() {
    setChangeProfileOpen(false)
    clearStoredProfile()
    onProfileReset()
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <PageTitle icon={NavIcon.settings}>Settings</PageTitle>

      <div className="mt-5 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          This phone&apos;s profile
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {profile ? <OwnerBadge owner={profile} size="md" /> : 'Not selected'}
        </p>
        <button
          type="button"
          onClick={() => setChangeProfileOpen(true)}
          className="mt-3 w-full rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100"
        >
          Change Profile
        </button>
      </div>

      <div className="mt-6 space-y-2">
        {SETTINGS_SECTIONS.map((section) => (
          <SettingsNavRow key={section.to} {...section} />
        ))}
      </div>

      <div className="mt-10 pb-2 text-center text-xs text-neutral-400 dark:text-neutral-500">
        <p>Made by Ndod ❤️</p>
        <p className="mt-1">v{APP_VERSION}</p>
      </div>

      <ConfirmDialog
        open={changeProfileOpen}
        title="Change profile?"
        message="Change profile on this phone?"
        confirmLabel="Change"
        cancelLabel="Cancel"
        danger={false}
        onCancel={() => setChangeProfileOpen(false)}
        onConfirm={confirmChangeProfile}
      />
    </div>
  )
}
