-- Link transactions to their source monthly estimate bill.
-- Populated when a due item is checked; null for Quick Add manual entries.
alter table transactions
  add column if not exists recurring_bill_id uuid
    references recurring_bills(id) on delete set null;

create index if not exists transactions_recurring_bill_id_idx
  on transactions (recurring_bill_id)
  where recurring_bill_id is not null;
