-- Part 2 of checking accounts migration.
-- Run AFTER migrate_buckets_checking_accounts.sql (ADD VALUE) has succeeded.

create unique index if not exists buckets_system_checking_name_uidx
  on buckets (name)
  where is_system = true and kind = 'checking';

insert into buckets (name, kind, icon, target_amount, opening_balance, sort_order, is_system)
select 'Ndod Account', 'checking'::bucket_kind, '💙', null, 0, 0, true
where not exists (
  select 1 from buckets where kind = 'checking' and is_system = true and name = 'Ndod Account'
);

insert into buckets (name, kind, icon, target_amount, opening_balance, sort_order, is_system)
select 'Devi Account', 'checking'::bucket_kind, '💗', null, 0, 0, true
where not exists (
  select 1 from buckets where kind = 'checking' and is_system = true and name = 'Devi Account'
);
