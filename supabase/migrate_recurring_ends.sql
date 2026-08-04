-- Recurring templates: optional end month (installments / cicilan).
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_bills.sql).
-- Format: YYYY-MM. NULL = ongoing (no end).

alter table recurring_bills
  add column if not exists ends_year_month text;

comment on column recurring_bills.ends_year_month is
  'Last YYYY-MM this template appears on the checklist; null = ongoing';
