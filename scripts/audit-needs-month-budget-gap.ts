/**
 * Why History Needs expense ≠ Month Budget Planned Needs used + Buffer.
 * Usage: npx --yes tsx --env-file=.env scripts/audit-needs-month-budget-gap.ts [YYYY-MM]
 */
import './ws-shim.ts'
import { fetchBuckets } from '../src/lib/bucketsApi'
import { buildMonthBudgetEstimateRows, transactionsForEstimateBill } from '../src/lib/estimateProgress'
import {
  checkingBucketIdSet,
  computeMonthBudgetSpend,
  estimateExpenseCoverageKeys,
  unplannedNeedsTransactionIds,
} from '../src/lib/freeGuiltyProgress'
import { budgetGroupOfEstimate } from '../src/lib/freeWants'
import { budgetGroupOfTx } from '../src/lib/moneyPlan'
import { monthCursorRange } from '../src/lib/monthCursor'
import {
  dueBillIdByTxIdFromLogs,
  fetchRecurringBillLogs,
  fetchRecurringBillMonthOverrides,
  fetchRecurringBillOccurrenceSkipsInRange,
  fetchRecurringBills,
  occurrenceLogKey,
} from '../src/lib/recurringBillsApi'
import { supabase } from '../src/lib/supabase'
import { fetchTransactions } from '../src/lib/transactionsApi'
import type { Category } from '../src/lib/types'

function parseYm(raw: string): { year: number; month: number; ym: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim())
  if (!m) throw new Error('Use YYYY-MM')
  return { year: Number(m[1]), month: Number(m[2]) - 1, ym: raw.trim() }
}

async function main() {
  const { year, month, ym } = parseYm(process.argv[2] ?? '2026-08')
  const range = monthCursorRange({ year, month })
  const [transactions, bills, buckets, catRes, logs, overrides, skips] =
    await Promise.all([
      fetchTransactions(range),
      fetchRecurringBills({ includeInactive: true }),
      fetchBuckets({ includeInactive: true }),
      supabase.from('categories').select('*'),
      fetchRecurringBillLogs(ym),
      fetchRecurringBillMonthOverrides(ym),
      fetchRecurringBillOccurrenceSkipsInRange(ym, ym),
    ])
  if (catRes.error) throw new Error(catRes.error.message)
  const categoriesById = new Map<string, Category>()
  for (const row of catRes.data ?? []) {
    categoriesById.set(String((row as Category).id), row as Category)
  }
  const bucketsById = new Map(buckets.map((b) => [b.id, b]))
  const dueBillIdByTxId = dueBillIdByTxIdFromLogs(logs)
  const skipKeys = new Set(
    skips.map((s) => occurrenceLogKey(s.bill_id, s.occurred_on)),
  )
  const checkingIds = checkingBucketIdSet(buckets)
  const live = transactions.filter((t) => !t.complete_later)

  const estimateRows = buildMonthBudgetEstimateRows({
    bills,
    overridesByBillId: new Map(overrides.map((o) => [o.bill_id, o])),
    skippedOccurrenceKeys: skipKeys,
    categoriesById,
    bucketsById,
    yearMonth: ym,
    transactions: live,
    checkingBucketIds: checkingIds,
    dueBillIdByTxId,
  })

  const coverageKeys = estimateExpenseCoverageKeys(
    bills,
    categoriesById,
    (bill) => {
      const g = budgetGroupOfEstimate(bill, categoriesById)
      return g === 'needs' || g === 'wants'
    },
  )
  const spend = computeMonthBudgetSpend({
    estimateRows,
    transactions: live,
    estimateCoverageKeys: coverageKeys,
    checkingBucketIds: checkingIds,
    dueBillIdByTxId,
  })
  const unplannedIds = unplannedNeedsTransactionIds({
    transactions: live,
    estimateCoverageKeys: coverageKeys,
    checkingBucketIds: checkingIds,
    dueBillIdByTxId,
  })

  const onLineIds = new Set<string>()
  for (const row of estimateRows) {
    const bill = bills.find((b) => b.id === row.billId)
    if (!bill) continue
    const matched = transactionsForEstimateBill(
      bill,
      live,
      categoriesById,
      bucketsById,
      {
        mainCheckingOnly: true,
        checkingBucketIds: checkingIds,
        dueBillIdByTxId,
      },
    )
    for (const tx of matched) {
      if (budgetGroupOfTx(tx) === 'needs') onLineIds.add(tx.id)
    }
  }

  const needsExpenses = live.filter(
    (t) => t.type === 'expense' && budgetGroupOfTx(t) === 'needs',
  )
  const historyNeeds = needsExpenses.reduce((s, t) => s + t.amount, 0)
  const monthBudget = spend.needsUsed + spend.bufferSpent

  const gapTxs = needsExpenses
    .filter((t) => !onLineIds.has(t.id) && !unplannedIds.has(t.id))
    .map((t) => {
      const from = t.from_bucket
      const fromKind = from?.kind ?? (t.from_bucket_id == null ? 'main' : 'unknown')
      const cat = t.category
      const catName = cat?.parent
        ? `${cat.parent.name}/${cat.name}`
        : (cat?.name ?? '—')
      return {
        date: t.occurred_on,
        amount: t.amount,
        category: catName,
        note: t.description ?? '',
        from: from ? `${from.name} (${fromKind})` : 'Main Account',
        due: Boolean(t.recurring_bill_id || t.is_recurring || dueBillIdByTxId.has(t.id)),
      }
    })

  const gapSum = gapTxs.reduce((s, t) => s + t.amount, 0)
  const sinkingNeeds = needsExpenses.filter((t) => {
    const from = t.from_bucket_id
    return from != null && !checkingIds.has(from)
  })

  console.log(
    JSON.stringify(
      {
        yearMonth: ym,
        historyNeedsExpense: historyNeeds,
        plannedNeedsUsed: spend.needsUsed,
        bufferUsed: spend.bufferSpent,
        bufferOverspend: spend.needsOverspend,
        bufferUnplanned: spend.unplannedNeeds,
        monthBudgetSum: monthBudget,
        difference: historyNeeds - monthBudget,
        gapTxCount: gapTxs.length,
        gapTxSum: gapSum,
        sinkingNeedsCount: sinkingNeeds.length,
        sinkingNeedsSum: sinkingNeeds.reduce((s, t) => s + t.amount, 0),
        gapTxs,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
