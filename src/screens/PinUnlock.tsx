import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { APP_LOGO_URL } from '../lib/branding'
import {
  getHouseholdPin,
  markDeviceUnlocked,
  verifyHouseholdPin,
} from '../lib/deviceUnlock'
import { dismissNumericKeyboard } from '../lib/keyboardFocus'

interface PinUnlockProps {
  onUnlocked: () => void
}

export function PinUnlock({ onUnlocked }: PinUnlockProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const configured = Boolean(getHouseholdPin())

  function handoffAfterPinOk() {
    // Default land di Riwayat — tutup numpad PIN.
    dismissNumericKeyboard()
    inputRef.current?.blur()
  }

  function submit() {
    if (!configured) {
      setError('PIN is not configured on the server.')
      return
    }
    if (!verifyHouseholdPin(pin)) {
      setError('Wrong PIN')
      setPin('')
      inputRef.current?.focus()
      return
    }
    handoffAfterPinOk()
    markDeviceUnlocked()
    onUnlocked()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submit()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs text-center"
      >
        <img
          src={APP_LOGO_URL}
          alt="Ndod Budget"
          className="mx-auto h-[144px] w-[144px] object-contain"
        />
        <h1 className="mt-4 text-xl font-semibold text-neutral-50">
          Ndod Budget
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Enter the household PIN once on this phone.
        </p>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoFocus
          value={pin}
          onChange={(e) => {
            setError(null)
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
          }}
          onKeyDown={handleKeyDown}
          placeholder="••••"
          className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3 text-center text-2xl tracking-[0.4em] text-neutral-50 outline-none ring-1 ring-neutral-700 focus:ring-emerald-500"
        />

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={pin.length < 4}
          onPointerDown={() => {
            // Amankan window gesture sebelum form submit / re-render.
            if (pin.length >= 4 && configured && verifyHouseholdPin(pin)) {
              handoffAfterPinOk()
            }
          }}
          className="mt-5 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white active:bg-emerald-500 disabled:opacity-40"
        >
          Continue
        </button>

        <p className="mt-4 text-xs text-neutral-500">
          Once verified, this phone won't ask for the PIN again.
        </p>
      </form>
    </div>
  )
}
