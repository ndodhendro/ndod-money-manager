-- Per-occurrence soft-skip (skip one weekly date without skipping the whole month).
-- Run once in Supabase SQL Editor (after migrate_recurring_month_skipped.sql).

create table if not exists recurring_bill_occurrence_skips (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  year_month text not null,
  occurred_on date not null,
  unique (bill_id, occurred_on)
);

create index if not exists recurring_bill_occurrence_skips_month_idx
  on recurring_bill_occurrence_skips (year_month);

alter table recurring_bill_occurrence_skips enable row level security;

drop policy if exists "recurring_bill_occurrence_skips_anon_all"
  on recurring_bill_occurrence_skips;
create policy "recurring_bill_occurrence_skips_anon_all"
  on recurring_bill_occurrence_skips
  for all to anon using (true) with check (true);
