-- Soft-skip recurring checklist items for one month (template unchanged).
-- Run once in Supabase SQL Editor (after migrate_recurring_month_overrides.sql).

alter table recurring_bill_month_overrides
  add column if not exists skipped boolean not null default false;

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'recurring_bill_month_overrides'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%amount%'
    and pg_get_constraintdef(oid) ilike '%due_day%'
    and pg_get_constraintdef(oid) not ilike '%skipped%';
  if cname is not null then
    execute format(
      'alter table recurring_bill_month_overrides drop constraint %I',
      cname
    );
  end if;
end $$;

alter table recurring_bill_month_overrides
  drop constraint if exists recurring_bill_month_overrides_value_check;

alter table recurring_bill_month_overrides
  add constraint recurring_bill_month_overrides_value_check
  check (amount is not null or due_day is not null or skipped = true);
