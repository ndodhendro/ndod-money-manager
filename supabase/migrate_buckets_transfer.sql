-- Buckets + transfer type. Jalankan sekali di Supabase SQL Editor.
-- (Tidak meng-insert type=transfer di sini — aman satu transaksi.)

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'transaction_type' and e.enumlabel = 'transfer'
  ) then
    alter type transaction_type add value 'transfer';
  end if;
end $$;

do $$ begin
  create type bucket_kind as enum ('emergency', 'investment', 'sinking');
exception when duplicate_object then null; end $$;

create table if not exists buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind bucket_kind not null,
  icon text not null default '🏦',
  target_amount numeric(14, 2),
  opening_balance numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists buckets_system_kind_uidx
  on buckets (kind)
  where is_system = true and kind in ('emergency', 'investment');

create index if not exists buckets_active_sort_idx
  on buckets (is_active, sort_order);

alter table transactions
  add column if not exists from_bucket_id uuid references buckets(id) on delete restrict;

alter table transactions
  add column if not exists to_bucket_id uuid references buckets(id) on delete restrict;

create index if not exists transactions_from_bucket_idx on transactions (from_bucket_id);
create index if not exists transactions_to_bucket_idx on transactions (to_bucket_id);

alter table buckets enable row level security;
drop policy if exists "buckets_anon_all" on buckets;
create policy "buckets_anon_all" on buckets for all to anon using (true) with check (true);

alter table pyf_settings
  add column if not exists planned_needs_amount numeric(14, 2) not null default 0;

insert into buckets (name, kind, icon, target_amount, opening_balance, sort_order, is_system)
select 'Emergency Fund', 'emergency', '🛟', null, 0, 1, true
where not exists (select 1 from buckets where kind = 'emergency' and is_system = true);

insert into buckets (name, kind, icon, target_amount, opening_balance, sort_order, is_system)
select 'Investment', 'investment', '📈', null, 0, 2, true
where not exists (select 1 from buckets where kind = 'investment' and is_system = true);

insert into buckets (name, kind, icon, target_amount, opening_balance, sort_order, is_system)
select v.name, 'sinking'::bucket_kind, v.icon, v.target_amount, 0, v.sort_order, false
from (values
  ('Car tax', '🚗', 5000000::numeric, 10),
  ('Car service', '🛠️', 3000000::numeric, 11)
) as v(name, icon, target_amount, sort_order)
where not exists (
  select 1 from buckets b where b.name = v.name and b.kind = 'sinking'
);
