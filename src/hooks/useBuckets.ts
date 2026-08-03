import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  computeBucketBalances,
  ensureSystemBuckets,
  fetchBuckets,
  fetchTransferMovements,
} from '../lib/bucketsApi'
import type { Bucket, BucketWithBalance } from '../lib/types'

export function useBuckets(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [movements, setMovements] = useState<
    Array<{
      amount: number
      from_bucket_id: string | null
      to_bucket_id: string | null
      occurred_on: string
    }>
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await ensureSystemBuckets()
      const [bucketRows, transferRows] = await Promise.all([
        fetchBuckets({ includeInactive }),
        fetchTransferMovements(),
      ])
      setBuckets(bucketRows)
      setMovements(transferRows)
    } catch (err) {
      setBuckets([])
      setMovements([])
      const message =
        err instanceof Error ? err.message : 'Failed to load buckets'
      // Belum migrasi: jangan ganggu History/Summary — Transfer butuh SQL dulu.
      if (isMissingBucketsSchema(message)) {
        setError(null)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    void reload()
  }, [reload])

  const balances = useMemo(
    () => computeBucketBalances(buckets, movements),
    [buckets, movements],
  )

  const withBalances: BucketWithBalance[] = useMemo(
    () =>
      buckets.map((b) => ({
        ...b,
        balance: balances.get(b.id) ?? b.opening_balance,
      })),
    [buckets, balances],
  )

  const byId = useMemo(() => {
    const map = new Map<string, BucketWithBalance>()
    for (const b of withBalances) map.set(b.id, b)
    return map
  }, [withBalances])

  const emergency = withBalances.find((b) => b.kind === 'emergency') ?? null
  const investment = withBalances.find((b) => b.kind === 'investment') ?? null

  return {
    buckets: withBalances,
    movements,
    byId,
    emergency,
    investment,
    loading,
    error,
    reload,
  }
}

function isMissingBucketsSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('buckets') ||
    lower.includes('from_bucket') ||
    lower.includes('to_bucket') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist')
  )
}
