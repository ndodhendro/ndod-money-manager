-- Recurring templates: every N months (1–12). Default 1 = monthly.
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_bills.sql).

alter table recurring_bills
  add column if not exists interval_months smallint not null default 1
  check (interval_months >= 1 and interval_months <= 12);
