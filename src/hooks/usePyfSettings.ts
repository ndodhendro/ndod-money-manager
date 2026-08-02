import { useCallback, useEffect, useState } from 'react'
import {
  getPyfSettings,
  updatePyfSettings,
  type PyfSettings,
  type PyfSettingsUpdate,
} from '../lib/pyfSettingsApi'

export function usePyfSettings() {
  const [settings, setSettings] = useState<PyfSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const row = await getPyfSettings()
      setSettings(row)
    } catch (err) {
      setSettings(null)
      setError(err instanceof Error ? err.message : 'Failed to load money plan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(
    async (patch: PyfSettingsUpdate) => {
      if (!settings) throw new Error('Money plan not loaded')
      const next = await updatePyfSettings(settings.id, patch)
      setSettings(next)
      return next
    },
    [settings],
  )

  return { settings, loading, error, reload, save }
}
