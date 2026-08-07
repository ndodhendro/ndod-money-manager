-- Variable amount flag for recurring bills (amount may differ each cycle).
-- Jalankan sekali di Supabase SQL Editor.

alter table recurring_bills
  add column if not exists variable_amount boolean not null default false;

comment on column recurring_bills.variable_amount is
  'When true, Plan checklist confirms amount before check (gold highlight when unchecked)';
