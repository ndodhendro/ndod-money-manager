-- Recurring bills checklist. Jalankan sekali di Supabase SQL Editor.

create table if not exists recurring_bills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(14, 2) not null check (amount > 0),
  category_id uuid references categories(id) on delete set null,
  circle circle_type not null default 'hd_family',
  icon text not null default '📌',
  starts_year_month text,
  ends_year_month text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists recurring_bills_active_sort_idx
  on recurring_bills (is_active, sort_order);

create table if not exists recurring_bill_logs (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  year_month text not null,
  transaction_id uuid references transactions(id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (bill_id, year_month)
);

create index if not exists recurring_bill_logs_month_idx
  on recurring_bill_logs (year_month);

alter table recurring_bills enable row level security;
alter table recurring_bill_logs enable row level security;

drop policy if exists "recurring_bills_anon_all" on recurring_bills;
create policy "recurring_bills_anon_all" on recurring_bills
  for all to anon using (true) with check (true);

drop policy if exists "recurring_bill_logs_anon_all" on recurring_bill_logs;
create policy "recurring_bill_logs_anon_all" on recurring_bill_logs
  for all to anon using (true) with check (true);
