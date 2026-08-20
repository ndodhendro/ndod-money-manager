-- Money Manager - schema awal
-- Jalankan file ini sekali di Supabase SQL Editor (project baru).

create extension if not exists "pgcrypto";

do $$ begin
  create type transaction_type as enum ('income', 'expense', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type budget_group as enum ('needs', 'wants', 'savings');
exception when duplicate_object then null; end $$;

do $$ begin
  create type owner_type as enum ('suami', 'istri');
exception when duplicate_object then null; end $$;

do $$ begin
  create type circle_type as enum ('hd_family', 'extended_family', 'friends');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bucket_kind as enum ('checking', 'emergency', 'investment', 'sinking');
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

-- Satu nama aktif per type + sibling + budget_group (inactive boleh duplikat; revive on add).
-- Expense: unique includes Needs/Wants/Savings. Income uses the null-budget partial index.
create unique index if not exists categories_name_parent_budget_active_uidx
  on categories (
    type,
    name,
    (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    budget_group
  )
  where is_active = true and budget_group is not null;

create unique index if not exists categories_name_parent_active_null_budget_uidx
  on categories (
    type,
    name,
    (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where is_active = true and budget_group is null;

create index if not exists categories_parent_id_idx on categories (parent_id);
create index if not exists categories_type_active_idx on categories (type, is_active);

-- ============================================================
-- buckets (Emergency / Investment / sinking funds)
-- ============================================================
create table if not exists buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind bucket_kind not null,
  icon text not null default '🏦',
  target_amount numeric(14, 2),
  opening_balance numeric(14, 2) not null default 0,
  -- When the app is initialized mid-way through a recurring sinking plan,
  -- user can optionally say how many recurring transfers already happened
  -- before this "opening_balance" was recorded (to keep pacing aligned).
  opening_transfers integer not null default 0,
  -- Needs/Wants for sinking funds; null for emergency/investment.
  budget_group budget_group,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists buckets_system_kind_uidx
  on buckets (kind)
  where is_system = true and kind in ('emergency', 'investment');

create unique index if not exists buckets_system_checking_name_uidx
  on buckets (name)
  where is_system = true and kind = 'checking';

create index if not exists buckets_active_sort_idx
  on buckets (is_active, sort_order);

-- ============================================================
-- transactions (MVP inti - dipakai layar Quick Add / Riwayat / Ringkasan)
-- ============================================================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type transaction_type not null,
  category_id uuid references categories(id) on delete set null,
  from_bucket_id uuid references buckets(id) on delete restrict,
  to_bucket_id uuid references buckets(id) on delete restrict,
  amount numeric(14, 2) not null,
  description text,
  owner owner_type not null,
  circle circle_type not null default 'hd_family',
  occurred_on date not null default current_date,
  is_recurring boolean not null default false,
  -- Links a recurring due-item check back to its monthly estimate bill. Null for Quick Add manual entries.
  recurring_bill_id uuid references recurring_bills(id) on delete set null,
  complete_later boolean not null default false,
  -- Expense Needs/Wants for this row; null = inherit subcategory default.
  budget_group budget_group,
  -- Order within occurred_on. Lower = earlier that day (bottom of History).
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_check check (amount > 0 or complete_later = true)
);

create index if not exists transactions_occurred_on_idx on transactions (occurred_on desc);
create index if not exists transactions_occurred_on_sort_idx
  on transactions (occurred_on, sort_order);
create index if not exists transactions_category_id_idx on transactions (category_id);
create index if not exists transactions_circle_idx on transactions (circle);
create index if not exists transactions_from_bucket_idx on transactions (from_bucket_id);
create index if not exists transactions_to_bucket_idx on transactions (to_bucket_id);
create index if not exists transactions_complete_later_idx
  on transactions (complete_later)
  where complete_later = true;
create index if not exists transactions_recurring_bill_id_idx
  on transactions (recurring_bill_id)
  where recurring_bill_id is not null;

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
  emergency_fund_pct numeric(5, 2) not null default 10,
  investment_pct numeric(5, 2) not null default 15,
  buffer_pct numeric(5, 2) not null default 10,
  planned_needs_amount numeric(14, 2) not null default 0,
  emergency_fund_target_multiplier numeric(4, 1) not null default 3,
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
-- recurring bills (checklist; every N months/weeks via interval_*)
-- ============================================================
create table if not exists recurring_bills (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  amount numeric(14, 2) not null check (amount > 0),
  type transaction_type not null default 'expense',
  category_id uuid references categories(id) on delete set null,
  from_bucket_id uuid references buckets(id) on delete set null,
  to_bucket_id uuid references buckets(id) on delete set null,
  circle circle_type not null default 'hd_family',
  owner owner_type not null default 'suami',
  due_day smallint not null default 1 check (due_day >= 1 and due_day <= 31),
  interval_unit text not null default 'month' check (interval_unit in ('week', 'month')),
  -- N in "every N"; for week only 1 or 2; for month 1–120 (years as multiples of 12)
  interval_months smallint not null default 1,
  starts_year_month text,
  ends_year_month text,
  -- First due / weekly grid anchor (required when interval_unit = week)
  starts_on date,
  -- Amount may differ each cycle — Plan confirms before check
  variable_amount boolean not null default false,
  -- false = monthly amount estimate only (no due dates / checklist)
  is_recurring boolean not null default true,
  -- Expense Needs/Wants for this estimate; null = inherit subcategory default.
  budget_group budget_group,
  icon text not null default '📌',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (interval_unit = 'month' and interval_months >= 1 and interval_months <= 120)
    or (interval_unit = 'week' and interval_months in (1, 2))
  )
);

create index if not exists recurring_bills_active_sort_idx
  on recurring_bills (is_active, sort_order);

create table if not exists recurring_bill_logs (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  year_month text not null,
  occurred_on date not null,
  transaction_id uuid references transactions(id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (bill_id, occurred_on)
);

create index if not exists recurring_bill_logs_month_idx
  on recurring_bill_logs (year_month);

create index if not exists recurring_bill_logs_occurred_on_idx
  on recurring_bill_logs (occurred_on);

-- Per-month amount / due_day overrides (Plan checklist only; template unchanged).
create table if not exists recurring_bill_month_overrides (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  year_month text not null,
  amount numeric(14, 2) check (amount is null or amount > 0),
  due_day smallint check (due_day is null or (due_day >= 1 and due_day <= 31)),
  unique (bill_id, year_month),
  check (amount is not null or due_day is not null)
);

create index if not exists recurring_bill_month_overrides_month_idx
  on recurring_bill_month_overrides (year_month);

-- Per-occurrence soft-skip (weekly: skip one date without skipping the month).
create table if not exists recurring_bill_occurrence_skips (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  year_month text not null,
  occurred_on date not null,
  unique (bill_id, occurred_on)
);

create index if not exists recurring_bill_occurrence_skips_month_idx
  on recurring_bill_occurrence_skips (year_month);

-- ============================================================
-- Row Level Security
-- Tidak ada login/auth di app ini (lihat catatan desain). Akses pakai anon
-- key + policy permisif. Cukup aman untuk data budget rumah tangga pribadi
-- selama URL app & anon key tidak disebar publik. Lihat README untuk opsi
-- upgrade keamanan (passphrase) di kemudian hari.
-- ============================================================
alter table categories enable row level security;
alter table buckets enable row level security;
alter table transactions enable row level security;
alter table pyf_settings enable row level security;
alter table sinking_funds enable row level security;
alter table debts enable row level security;
alter table recurring_bills enable row level security;
alter table recurring_bill_logs enable row level security;
alter table recurring_bill_month_overrides enable row level security;
alter table recurring_bill_occurrence_skips enable row level security;

drop policy if exists "categories_anon_all" on categories;
create policy "categories_anon_all" on categories for all to anon using (true) with check (true);

drop policy if exists "buckets_anon_all" on buckets;
create policy "buckets_anon_all" on buckets for all to anon using (true) with check (true);

drop policy if exists "transactions_anon_all" on transactions;
create policy "transactions_anon_all" on transactions for all to anon using (true) with check (true);

drop policy if exists "pyf_settings_anon_all" on pyf_settings;
create policy "pyf_settings_anon_all" on pyf_settings for all to anon using (true) with check (true);

drop policy if exists "sinking_funds_anon_all" on sinking_funds;
create policy "sinking_funds_anon_all" on sinking_funds for all to anon using (true) with check (true);

drop policy if exists "debts_anon_all" on debts;
create policy "debts_anon_all" on debts for all to anon using (true) with check (true);

drop policy if exists "recurring_bills_anon_all" on recurring_bills;
create policy "recurring_bills_anon_all" on recurring_bills
  for all to anon using (true) with check (true);

drop policy if exists "recurring_bill_logs_anon_all" on recurring_bill_logs;
create policy "recurring_bill_logs_anon_all" on recurring_bill_logs
  for all to anon using (true) with check (true);

drop policy if exists "recurring_bill_month_overrides_anon_all" on recurring_bill_month_overrides;
create policy "recurring_bill_month_overrides_anon_all" on recurring_bill_month_overrides
  for all to anon using (true) with check (true);

drop policy if exists "recurring_bill_occurrence_skips_anon_all" on recurring_bill_occurrence_skips;
create policy "recurring_bill_occurrence_skips_anon_all" on recurring_bill_occurrence_skips
  for all to anon using (true) with check (true);

-- ============================================================
-- Realtime (dipakai fitur auto-sync antar HP suami & istri)
-- ============================================================
alter publication supabase_realtime add table transactions;
