-- Recurring templates: optional start month.
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_bills.sql).
-- Format: YYYY-MM. NULL = active from all past months (legacy behavior).

alter table recurring_bills
  add column if not exists starts_year_month text;

comment on column recurring_bills.starts_year_month is
  'First YYYY-MM this template appears on the checklist; null = no lower bound';
