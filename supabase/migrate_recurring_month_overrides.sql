-- Per-month amount / due_day overrides for Plan checklist (template unchanged).
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_bills.sql).

create table if not exists recurring_bill_month_overrides (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  year_month text not null,
  amount numeric(14, 2) check (amount is null or amount > 0),
  due_day smallint check (due_day is null or (due_day >= 1 and due_day <= 31)),
  unique (bill_id, year_month),
  check (amount is not null or due_day is not null)
);

create index if not exists recurring_bill_month_overrides_month_idx
  on recurring_bill_month_overrides (year_month);

alter table recurring_bill_month_overrides enable row level security;

drop policy if exists "recurring_bill_month_overrides_anon_all" on recurring_bill_month_overrides;
create policy "recurring_bill_month_overrides_anon_all" on recurring_bill_month_overrides
  for all to anon using (true) with check (true);
