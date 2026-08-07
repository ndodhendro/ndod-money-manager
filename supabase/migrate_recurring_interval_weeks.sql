-- Weekly Every: 1 week / 2 weeks (interval_unit + starts_on).
-- Logs keyed by occurred_on so multiple checklist rows can exist in one month.
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_interval_years.sql).

alter table recurring_bills
  add column if not exists interval_unit text not null default 'month';

alter table recurring_bills
  drop constraint if exists recurring_bills_interval_unit_check;

alter table recurring_bills
  add constraint recurring_bills_interval_unit_check
  check (interval_unit in ('week', 'month'));

alter table recurring_bills
  add column if not exists starts_on date;

comment on column recurring_bills.interval_unit is
  'month = every N months; week = every N weeks (N is interval_months, 1 or 2)';

comment on column recurring_bills.starts_on is
  'First due date / weekly grid anchor (required when interval_unit = week)';

alter table recurring_bills
  drop constraint if exists recurring_bills_interval_months_check;

alter table recurring_bills
  add constraint recurring_bills_interval_months_check
  check (
    (interval_unit = 'month' and interval_months >= 1 and interval_months <= 120)
    or (interval_unit = 'week' and interval_months in (1, 2))
  );

-- ----------------------------------------------------------
-- Logs: occurred_on unique (bill_id, occurred_on)
-- ----------------------------------------------------------
alter table recurring_bill_logs
  add column if not exists occurred_on date;

update recurring_bill_logs l
set occurred_on = (
  select make_date(
    split_part(l.year_month, '-', 1)::int,
    split_part(l.year_month, '-', 2)::int,
    least(
      coalesce(b.due_day, 1),
      extract(
        day from (
          date_trunc(
            'month',
            make_date(
              split_part(l.year_month, '-', 1)::int,
              split_part(l.year_month, '-', 2)::int,
              1
            )
          ) + interval '1 month - 1 day'
        )
      )::int
    )
  )
  from recurring_bills b
  where b.id = l.bill_id
)
where l.occurred_on is null;

update recurring_bill_logs
set occurred_on = (year_month || '-01')::date
where occurred_on is null
  and year_month ~ '^\d{4}-\d{2}$';

alter table recurring_bill_logs
  alter column occurred_on set not null;

alter table recurring_bill_logs
  drop constraint if exists recurring_bill_logs_bill_id_year_month_key;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'recurring_bill_logs'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%bill_id%'
      and pg_get_constraintdef(oid) ilike '%year_month%'
  ) then
    execute (
      select 'alter table recurring_bill_logs drop constraint ' || quote_ident(conname)
      from pg_constraint
      where conrelid = 'recurring_bill_logs'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) ilike '%bill_id%'
        and pg_get_constraintdef(oid) ilike '%year_month%'
      limit 1
    );
  end if;
end $$;

alter table recurring_bill_logs
  drop constraint if exists recurring_bill_logs_bill_id_occurred_on_key;

alter table recurring_bill_logs
  add constraint recurring_bill_logs_bill_id_occurred_on_key
  unique (bill_id, occurred_on);

create index if not exists recurring_bill_logs_occurred_on_idx
  on recurring_bill_logs (occurred_on);
