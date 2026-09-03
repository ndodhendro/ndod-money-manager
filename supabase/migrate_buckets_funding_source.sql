-- Sinking funds: exclusive funding channel — Monthly Estimate transfer vs
-- bonus income (Holiday Bonus / THR and Performance Bonus).

alter table buckets
  add column if not exists funding_source text not null default 'monthly_estimate';

alter table buckets
  drop constraint if exists buckets_funding_source_check;

alter table buckets
  add constraint buckets_funding_source_check
  check (funding_source in ('monthly_estimate', 'bonus'));

comment on column buckets.funding_source is
  'Sinking funds only: monthly_estimate = transfer in Monthly Estimates; bonus = THR / Performance Bonus allocation.';

-- Preserve the old 12-month-transfer heuristic so existing yearly sinking
-- funds stay in bonus allocation until the user changes the flag.
update buckets b
set funding_source = 'bonus'
where b.kind = 'sinking'
  and exists (
    select 1
    from recurring_bills r
    where r.is_active
      and r.type = 'transfer'
      and r.is_recurring
      and r.to_bucket_id = b.id
      and r.interval_unit = 'month'
      and r.interval_months = 12
  );
