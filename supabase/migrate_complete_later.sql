-- Migration: Complete Later flag (placeholder txs; note required, amount may be 0)
-- Run once in Supabase SQL Editor on an existing project.

alter table transactions
  add column if not exists complete_later boolean not null default false;

comment on column transactions.complete_later is
  'When true, placeholder to finish later; note required, amount may be 0';

-- Replace amount > 0 check so amount = 0 is allowed only when complete_later.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'transactions'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%amount%'
  loop
    execute format('alter table transactions drop constraint %I', r.conname);
  end loop;
end $$;

alter table transactions
  drop constraint if exists transactions_amount_check;

alter table transactions
  add constraint transactions_amount_check
  check (amount > 0 or complete_later = true);

create index if not exists transactions_complete_later_idx
  on transactions (complete_later)
  where complete_later = true;
