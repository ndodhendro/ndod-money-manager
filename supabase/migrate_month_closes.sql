-- Month close snapshots, leftover allocation, and next-month opening carry.
-- Safe to re-run.

create table if not exists month_closes (
  id uuid primary key default gen_random_uuid(),
  year_month text not null unique,
  income numeric(14, 2) not null default 0,
  planned_needs numeric(14, 2) not null default 0,
  planned_wants numeric(14, 2) not null default 0,
  buffer_allowance numeric(14, 2) not null default 0,
  buffer_used numeric(14, 2) not null default 0,
  buffer_remaining numeric(14, 2) not null default 0,
  guilt_free_allowance numeric(14, 2) not null default 0,
  guilt_free_used numeric(14, 2) not null default 0,
  guilt_free_remaining numeric(14, 2) not null default 0,
  -- Allocation of Buffer leftover (must sum to buffer_remaining)
  buffer_to_ef numeric(14, 2) not null default 0,
  buffer_to_investment numeric(14, 2) not null default 0,
  buffer_to_buffer numeric(14, 2) not null default 0,
  buffer_to_guilt_free numeric(14, 2) not null default 0,
  -- Allocation of Guilt-Free leftover (must sum to guilt_free_remaining)
  guilt_free_to_ef numeric(14, 2) not null default 0,
  guilt_free_to_investment numeric(14, 2) not null default 0,
  guilt_free_to_buffer numeric(14, 2) not null default 0,
  guilt_free_to_guilt_free numeric(14, 2) not null default 0,
  -- Opening carries applied to the next calendar month
  opening_buffer_next numeric(14, 2) not null default 0,
  opening_guilt_free_next numeric(14, 2) not null default 0,
  closed_at timestamptz not null default now(),
  reopened_at timestamptz
);

create index if not exists month_closes_closed_at_idx on month_closes (closed_at);

comment on table month_closes is
  'End-of-month close: freezes envelopes and records 100% leftover allocation.';
