-- Money Manager - schema awal
-- Jalankan file ini sekali di Supabase SQL Editor (project baru).

create extension if not exists "pgcrypto";

do $$ begin
  create type transaction_type as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_group as enum ('needs', 'wants');
exception when duplicate_object then null; end $$;

do $$ begin
  create type owner_type as enum ('suami', 'istri');
exception when duplicate_object then null; end $$;

-- ============================================================
-- categories
-- ============================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type transaction_type not null,
  budget_group budget_group,
  icon text not null default '🏷️',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  parent_id uuid references categories(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Nama unik di antara sibling (termasuk root: parent_id null).
create unique index if not exists categories_name_parent_uidx
  on categories (name, (coalesce(parent_id, '00000000-0000-0000-0000-000000000000')));

create index if not exists categories_parent_id_idx on categories (parent_id);
create index if not exists categories_type_active_idx on categories (type, is_active);

-- ============================================================
-- transactions (MVP inti - dipakai layar Quick Add / Riwayat / Ringkasan)
-- ============================================================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type transaction_type not null,
  category_id uuid references categories(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  owner owner_type not null,
  occurred_on date not null default current_date,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_occurred_on_idx on transactions (occurred_on desc);
create index if not exists transactions_category_id_idx on transactions (category_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
before update on transactions
for each row execute function set_updated_at();

-- ============================================================
-- Placeholder Phase 2 (skema disiapkan sekarang, belum dipakai UI)
-- ============================================================
create table if not exists pyf_settings (
  id uuid primary key default gen_random_uuid(),
  emergency_fund_pct numeric(5, 2) not null default 20,
  investment_pct numeric(5, 2) not null default 15,
  emergency_fund_target_multiplier numeric(4, 1) not null default 6,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists sinking_funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references categories(id) on delete set null,
  target_amount numeric(14, 2) not null,
  target_frequency text not null default 'yearly',
  accumulated_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references categories(id) on delete set null,
  monthly_amount numeric(14, 2) not null,
  tenor_months integer not null,
  started_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- Tidak ada login/auth di app ini (lihat catatan desain). Akses pakai anon
-- key + policy permisif. Cukup aman untuk data budget rumah tangga pribadi
-- selama URL app & anon key tidak disebar publik. Lihat README untuk opsi
-- upgrade keamanan (passphrase) di kemudian hari.
-- ============================================================
alter table categories enable row level security;
alter table transactions enable row level security;
alter table pyf_settings enable row level security;
alter table sinking_funds enable row level security;
alter table debts enable row level security;

drop policy if exists "categories_anon_all" on categories;
create policy "categories_anon_all" on categories for all to anon using (true) with check (true);

drop policy if exists "transactions_anon_all" on transactions;
create policy "transactions_anon_all" on transactions for all to anon using (true) with check (true);

drop policy if exists "pyf_settings_anon_all" on pyf_settings;
create policy "pyf_settings_anon_all" on pyf_settings for all to anon using (true) with check (true);

drop policy if exists "sinking_funds_anon_all" on sinking_funds;
create policy "sinking_funds_anon_all" on sinking_funds for all to anon using (true) with check (true);

drop policy if exists "debts_anon_all" on debts;
create policy "debts_anon_all" on debts for all to anon using (true) with check (true);

-- ============================================================
-- Realtime (dipakai fitur auto-sync antar HP suami & istri)
-- ============================================================
alter publication supabase_realtime add table transactions;
