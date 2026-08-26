/**
 * Coverage pass: every month transaction vs Plan matching (same functions as the app).
 * Usage: npx --yes tsx --env-file=.env scripts/audit-month-coverage.ts [YYYY-MM]
 */
import './ws-shim.ts'
import { fetchBuckets } from '../src/lib/bucketsApi'
import {
  buildEstimateProgressRows,
  transactionsForEstimateBill,
} from '../src/lib/estimateProgress'
import {
  checkingBucketIdSet,
  estimateExpenseCoverageKeys,
  unplannedNeedsTransactionIds,
} from '../src/lib/freeGuiltyProgress'
import { budgetGroupOfEstimate } from '../src/lib/freeWants'
import { budgetGroupOfTx } from '../src/lib/moneyPlan'
import {
  buildMonthBudgetEstimateRows,
  transactionsForEstimateBill,
} from '../src/lib/estimateProgress'
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

function txLabel(tx: {
  occurred_on: string
  type: string
  amount: number
  description: string | null
  category?: { name: string; parent?: { name: string } | null } | null
}): string {
  const cat = tx.category
    ? tx.category.parent
      ? `${tx.category.parent.name}/${tx.category.name}`
      : tx.category.name
    : tx.type
  const note = (tx.description ?? '').trim()
  return `${tx.occurred_on} ${cat}${note ? ` · ${note}` : ''} ${tx.amount}`
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
  const overridesByBill = new Map(overrides.map((o) => [o.bill_id, o]))
  const checkingIds = checkingBucketIdSet(buckets)

  const live = transactions.filter((t) => !t.complete_later)
  const completeLater = transactions.filter((t) => t.complete_later)

  const estimateBills = bills.filter((bill) => {
    if (!bill.is_active) return false
    const g = budgetGroupOfEstimate(bill, categoriesById, bucketsById)
    return g === 'needs' || g === 'wants'
  })

  const rawMatches = new Map<string, string[]>()
  for (const bill of estimateBills) {
    const matched = transactionsForEstimateBill(
      bill,
      live,
      categoriesById,
      bucketsById,
      { dueBillIdByTxId },
    )
    for (const tx of matched) {
      const list = rawMatches.get(tx.id) ?? []
      list.push(bill.name)
      rawMatches.set(tx.id, list)
    }
  }

  const rows = buildEstimateProgressRows({
    bills,
    overridesByBillId: overridesByBill,
    skippedOccurrenceKeys: skipKeys,
    categoriesById,
    bucketsById,
    yearMonth: ym,
    transactions: live,
    dueBillIdByTxId,
  })

  const assignedMatches = new Map<string, string[]>()
  const assignedIds = new Set<string>()
  for (const row of rows) {
    const bill = bills.find((b) => b.id === row.billId)
    if (!bill) continue
    const matched = transactionsForEstimateBill(
      bill,
      live,
      categoriesById,
      bucketsById,
      {
        dueBillIdByTxId,
        excludeTxIds: assignedIds,
      },
    )
    for (const tx of matched) {
      const list = assignedMatches.get(tx.id) ?? []
      list.push(bill.name)
      assignedMatches.set(tx.id, list)
      if (
        tx.recurring_bill_id == null &&
        !dueBillIdByTxId.has(tx.id)
      ) {
        assignedIds.add(tx.id)
      }
    }
  }

  const coverageKeys = estimateExpenseCoverageKeys(
    bills,
    categoriesById,
    (bill) => {
      const g = budgetGroupOfEstimate(bill, categoriesById, bucketsById)
      return g === 'needs' || g === 'wants'
    },
  )
  const unplannedNeeds = unplannedNeedsTransactionIds({
    transactions: live,
    estimateCoverageKeys: coverageKeys,
    checkingBucketIds: checkingIds,
    dueBillIdByTxId,
  })
  const unplannedWants = unplannedWantsTransactionIds({
    transactions: live,
    estimateCoverageKeys: coverageKeys,
    checkingBucketIds: checkingIds,
    dueBillIdByTxId,
  })

  const doubleRaw = [...rawMatches.entries()].filter(([, names]) => names.length > 1)
  const doubleAssigned = [...assignedMatches.entries()].filter(
    ([, names]) => names.length > 1,
  )

  let needsExpense = 0
  let wantsExpense = 0
  let untaggedExpense = 0
  const untagged: string[] = []
  const income: string[] = []
  let incomeSum = 0
  let bonusSum = 0

  for (const tx of live) {
    if (tx.type === 'income') {
      if (isBonusIncomeCategory(tx.category)) bonusSum += tx.amount
      else incomeSum += tx.amount
      income.push(txLabel(tx))
      continue
    }
    if (tx.type === 'expense') {
      const g = budgetGroupOfTx(tx)
      if (g === 'needs') needsExpense += tx.amount
      else if (g === 'wants') wantsExpense += tx.amount
      else {
        untaggedExpense += tx.amount
        untagged.push(txLabel(tx))
      }
    }
  }

  const needsTransfer = sumTransferActualsByBudgetGroup(
    live,
    bucketsById,
    'needs',
    categoriesById,
  )
  const wantsTransfer = sumTransferActualsByBudgetGroup(
    live,
    bucketsById,
    'wants',
    categoriesById,
  )

  const transferOther: string[] = []
  for (const tx of live) {
    if (tx.type !== 'transfer') continue
    const sinking = budgetGroupOfTransferTo(
      tx.to_bucket_id,
      bucketsById,
      categoriesById,
    )
    const kind = tx.to_bucket_id
      ? bucketsById.get(tx.to_bucket_id)?.kind
      : null
    if (sinking || kind === 'emergency' || kind === 'investment') continue
    transferOther.push(
      `${txLabel(tx)} → ${tx.to_bucket?.name ?? 'Main'} (${kind ?? 'none'})`,
    )
  }

  const report = {
    yearMonth: ym,
    counts: {
      allRows: transactions.length,
      live: live.length,
      completeLater: completeLater.length,
      income: live.filter((t) => t.type === 'income').length,
      expense: live.filter((t) => t.type === 'expense').length,
      transfer: live.filter((t) => t.type === 'transfer').length,
    },
    planBars: {
      needs: needsExpense + needsTransfer,
      needsExpense,
      needsTransfer,
      wants: wantsExpense + wantsTransfer,
      wantsExpense,
      wantsTransfer,
      regularIncome: incomeSum,
      bonusIncome: bonusSum,
    },
    estimateLines: rows.map((r) => ({
      name: r.name,
      group: r.group,
      planned: r.planned,
      actual: r.actual,
    })),
    flags: {
      doubleCountAfterDedupe: doubleAssigned.map(([id, names]) => {
        const tx = live.find((t) => t.id === id)!
        return { tx: txLabel(tx), lines: names }
      }),
      rawMultiMatchBeforeDedupe: doubleRaw.length,
      untaggedExpenses: untagged,
      unplannedNeedsCount: unplannedNeeds.size,
      unplannedWantsCount: unplannedWants.size,
      transfersNotNeedsWantsOrPyf: transferOther,
    },
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
