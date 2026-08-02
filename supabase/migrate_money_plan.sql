-- Money Plan step 1/2 — jalankan dulu, commit selesai, lalu step 2.
-- (Enum value baru tidak bisa dipakai dalam transaksi yang sama di Postgres.)

do $$ begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'budget_group' and e.enumlabel = 'savings'
  ) then
    alter type budget_group add value 'savings';
  end if;
end $$;

alter table pyf_settings
  add column if not exists planned_needs_amount numeric(14, 2) not null default 0;

insert into pyf_settings (emergency_fund_pct, investment_pct, planned_needs_amount)
select 10, 15, 0
where not exists (select 1 from pyf_settings);
