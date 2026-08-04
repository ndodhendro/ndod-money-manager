const PREFIX = 'mm:collapse:'

/** Read collapse open state; falls back to defaultOpen if unset. */
export function getCollapseOpen(key: string, defaultOpen: boolean): boolean {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // private mode / blocked storage
  }
  return defaultOpen
}

/** Persist collapse open state for back-navigation remounts. */
export function setCollapseOpen(key: string, open: boolean): void {
  try {
    sessionStorage.setItem(PREFIX + key, open ? '1' : '0')
  } catch {
    // private mode / blocked storage
  }
}

/** True only when every key is currently open (missing keys use defaultOpen). */
export function areAllCollapseOpen(
  keys: string[],
  defaultOpen: boolean,
): boolean {
  if (keys.length === 0) return defaultOpen
  return keys.every((key) => getCollapseOpen(key, defaultOpen))
}
