-- Allow Every up to 10 years (120 months). Options: 1–12 months + 2–10 years.
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_interval_months.sql).

alter table recurring_bills
  drop constraint if exists recurring_bills_interval_months_check;

alter table recurring_bills
  add constraint recurring_bills_interval_months_check
  check (interval_months >= 1 and interval_months <= 120);
