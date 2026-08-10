-- Monthly Estimates: recurring is optional (estimate-only rows have no schedule).
-- Run once in Supabase SQL Editor.

alter table recurring_bills
  add column if not exists is_recurring boolean not null default true;

comment on column recurring_bills.is_recurring is
  'When false, row is a monthly amount estimate only (no due dates / checklist).';
