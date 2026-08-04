-- Recurring templates: due day of month (1–31, clamped when logging).
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_bills.sql).

alter table recurring_bills
  add column if not exists due_day smallint not null default 1
  check (due_day >= 1 and due_day <= 31);
