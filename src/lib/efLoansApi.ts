import { supabase } from './supabase'
import type { EfLoan, EfLoanSource, EfLoanStatus } from './types'

function isMissingEfLoansSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('ef_loans') ||
    (lower.includes('schema cache') && lower.includes('ef_loan'))
  )
}

function migrateHint(): Error {
  return new Error('Run migrate_ef_loans.sql in Supabase to enable EF loans')
}

function mapLoan(row: Record<string, unknown>): EfLoan {
  return {
    id: String(row.id),
    year_month: String(row.year_month),
    amount: Number(row.amount ?? 0),
    outstanding: Number(row.outstanding ?? 0),
    source: row.source as EfLoanSource,
    source_transaction_id:
      row.source_transaction_id == null
        ? null
        : String(row.source_transaction_id),
    status: row.status as EfLoanStatus,
    notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
  }
}

export async function fetchOpenEfLoans(): Promise<EfLoan[]> {
  const { data, error } = await supabase
    .from('ef_loans')
    .select('*')
    .eq('status', 'open')
    .gt('outstanding', 0)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingEfLoansSchema(error.message)) return []
    throw error
  }
  return (data ?? []).map((row) => mapLoan(row as Record<string, unknown>))
}

export async function sumOpenEfLoanOutstanding(): Promise<number> {
  const loans = await fetchOpenEfLoans()
  return loans.reduce((sum, loan) => sum + Math.max(0, loan.outstanding), 0)
}

export async function fetchEfLoanByTransactionId(
  transactionId: string,
): Promise<EfLoan | null> {
  const { data, error } = await supabase
    .from('ef_loans')
    .select('*')
    .eq('source_transaction_id', transactionId)
    .maybeSingle()

  if (error) {
    if (isMissingEfLoansSchema(error.message)) return null
    throw error
  }
  if (!data) return null
  return mapLoan(data as Record<string, unknown>)
}

/** Create or replace the open loan linked to a transaction. */
export async function upsertEfLoanForTransaction(input: {
  transactionId: string
  yearMonth: string
  amount: number
  source: EfLoanSource
}): Promise<void> {
  const amount = Math.max(0, Math.round(input.amount))
  if (amount <= 0) {
    await deleteEfLoanForTransaction(input.transactionId)
    return
  }

  const existing = await fetchEfLoanByTransactionId(input.transactionId)
  if (existing) {
    const repaid = Math.max(0, existing.amount - existing.outstanding)
    const outstanding = Math.max(0, amount - repaid)
    const { error } = await supabase
      .from('ef_loans')
      .update({
        year_month: input.yearMonth,
        amount,
        outstanding,
        source: input.source,
        status: outstanding > 0 ? 'open' : 'repaid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) {
      if (isMissingEfLoansSchema(error.message)) throw migrateHint()
      throw error
    }
    return
  }

  const { error } = await supabase.from('ef_loans').insert({
    year_month: input.yearMonth,
    amount,
    outstanding: amount,
    source: input.source,
    source_transaction_id: input.transactionId,
    status: 'open',
  })
  if (error) {
    if (isMissingEfLoansSchema(error.message)) throw migrateHint()
    throw error
  }
}

export async function deleteEfLoanForTransaction(
  transactionId: string,
): Promise<void> {
  const { error } = await supabase
    .from('ef_loans')
    .delete()
    .eq('source_transaction_id', transactionId)
  if (error && !isMissingEfLoansSchema(error.message)) throw error
}

/**
 * Apply a repayment against open loans (oldest first).
 * Does not create the Main→EF transfer — caller does that.
 */
export async function applyEfLoanRepayment(amount: number): Promise<number> {
  const pay = Math.max(0, Math.round(amount))
  if (pay <= 0) return 0

  const loans = await fetchOpenEfLoans()
  // Oldest first for FIFO repay
  loans.sort((a, b) => a.created_at.localeCompare(b.created_at))

  let remaining = pay
  for (const loan of loans) {
    if (remaining <= 0) break
    const take = Math.min(loan.outstanding, remaining)
    const outstanding = loan.outstanding - take
    const { error } = await supabase
      .from('ef_loans')
      .update({
        outstanding,
        status: outstanding > 0 ? 'open' : 'repaid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', loan.id)
    if (error) {
      if (isMissingEfLoansSchema(error.message)) throw migrateHint()
      throw error
    }
    remaining -= take
  }
  return pay - remaining
}

export function sumEfLoansBySource(loans: EfLoan[]): {
  buffer: number
  guiltFree: number
  total: number
} {
  let buffer = 0
  let guiltFree = 0
  for (const loan of loans) {
    if (loan.status !== 'open') continue
    if (loan.source === 'buffer') buffer += loan.outstanding
    else guiltFree += loan.outstanding
  }
  return { buffer, guiltFree, total: buffer + guiltFree }
}
