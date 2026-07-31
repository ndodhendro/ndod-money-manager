const UNLOCK_KEY = 'mm_device_unlocked'

export function isDeviceUnlocked(): boolean {
  return localStorage.getItem(UNLOCK_KEY) === '1'
}

export function markDeviceUnlocked(): void {
  localStorage.setItem(UNLOCK_KEY, '1')
}

export function getHouseholdPin(): string {
  return (import.meta.env.VITE_HOUSEHOLD_PIN as string | undefined)?.trim() ?? ''
}

export function verifyHouseholdPin(input: string): boolean {
  const expected = getHouseholdPin()
  if (!expected) return false
  return input === expected
}
