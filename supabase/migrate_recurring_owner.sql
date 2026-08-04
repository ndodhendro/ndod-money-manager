-- Recurring templates: owner (profile) for who the bill belongs to.
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_bills.sql).

alter table recurring_bills
  add column if not exists owner owner_type not null default 'suami';

comment on column recurring_bills.owner is
  'Profile (Ndod/Devi) this recurring template belongs to; used when logging the transaction.';
