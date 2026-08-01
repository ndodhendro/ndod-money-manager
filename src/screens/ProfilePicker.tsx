import { openNumericKeyboard } from '../lib/keyboardFocus'
import { APP_LOGO_URL } from '../lib/branding'
import { setStoredProfile } from '../lib/profile'
import { OWNER_BADGE_CLASS, type Owner } from '../lib/types'

interface ProfilePickerProps {
  onPicked: (owner: Owner) => void
}

const PROFILES: { owner: Owner; label: string; icon: string }[] = [
  { owner: 'suami', label: 'Ndod', icon: '🧑' },
  { owner: 'istri', label: 'Devi', icon: '👩' },
]

export function ProfilePicker({ onPicked }: ProfilePickerProps) {
  function choose(owner: Owner) {
    // Keyboard sudah dibuka di onPointerDown — jangan buka ulang (bisa kedip).
    setStoredProfile(owner)
    onPicked(owner)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-neutral-50 px-6 dark:bg-neutral-950">
      <div className="text-center">
        <img
          src={APP_LOGO_URL}
          alt="Ndod Budget"
          className="mx-auto h-[144px] w-[144px] object-contain"
        />
        <h1 className="mt-3 text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          Ndod Budget
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          HP ini dipakai oleh siapa?
        </p>
      </div>

      <div className="grid w-full max-w-xs grid-cols-2 gap-4">
        {PROFILES.map((profile) => (
          <button
            key={profile.owner}
            type="button"
            onPointerDown={() => openNumericKeyboard()}
            onClick={() => choose(profile.owner)}
            className={`flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-8 shadow-sm ring-2 ring-inset active:scale-95 dark:bg-neutral-900 ${
              profile.owner === 'suami'
                ? 'ring-blue-200 dark:ring-blue-900'
                : 'ring-pink-200 dark:ring-pink-900'
            }`}
          >
            <span className="text-4xl">{profile.icon}</span>
            <span
              className={`rounded-full px-2.5 py-1 text-sm font-medium ${OWNER_BADGE_CLASS[profile.owner]}`}
            >
              {profile.label}
            </span>
          </button>
        ))}
      </div>

      <p className="max-w-xs text-center text-xs text-neutral-400">
        Pilihan ini disimpan di HP ini saja, tidak akan ditanya lagi. Bisa
        diganti nanti lewat menu Pengaturan.
      </p>
    </div>
  )
}
