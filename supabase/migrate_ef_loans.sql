-- Emergency Fund loans from Buffer / Guilt-Free overspend.
-- Safe to re-run.

do $$ begin
  create type ef_loan_source as enum ('buffer', 'guilt_free');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ef_loan_status as enum ('open', 'repaid');
exception when duplicate_object then null; end $$;

create table if not exists ef_loans (
  id uuid primary key default gen_random_uuid(),
  year_month text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  outstanding numeric(14, 2) not null check (outstanding >= 0),
  source ef_loan_source not null,
  source_transaction_id uuid references transactions(id) on delete set null,
  status ef_loan_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ef_loans_source_tx_uidx
  on ef_loans (source_transaction_id)
  where source_transaction_id is not null;

create index if not exists ef_loans_status_idx on ef_loans (status);
create index if not exists ef_loans_year_month_idx on ef_loans (year_month);

comment on table ef_loans is
  'Buffer/Guilt-Free overspend borrowed from Emergency Fund (available EF = ledger − open outstanding).';
