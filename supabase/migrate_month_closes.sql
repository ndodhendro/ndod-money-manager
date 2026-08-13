-- Month close snapshots, leftover allocation, and next-month opening carry.
-- Safe to re-run.
-- Needs Side = Planned Needs rem + Buffer rem; Wants Side = Planned Wants rem + GF rem.

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
  planned_needs_remaining numeric(14, 2) not null default 0,
  planned_wants_remaining numeric(14, 2) not null default 0,
  -- Needs Side allocation (Planned Needs rem + Buffer rem); must sum to that total
  needs_side_to_ef numeric(14, 2) not null default 0,
  needs_side_to_investment numeric(14, 2) not null default 0,
  needs_side_to_buffer numeric(14, 2) not null default 0,
  needs_side_to_guilt_free numeric(14, 2) not null default 0,
  -- Wants Side allocation (Planned Wants rem + Guilt-Free rem)
  wants_side_to_ef numeric(14, 2) not null default 0,
  wants_side_to_investment numeric(14, 2) not null default 0,
  wants_side_to_buffer numeric(14, 2) not null default 0,
  wants_side_to_guilt_free numeric(14, 2) not null default 0,
  -- Legacy aliases (mirrored from needs/wants side on save)
  buffer_to_ef numeric(14, 2) not null default 0,
  buffer_to_investment numeric(14, 2) not null default 0,
  buffer_to_buffer numeric(14, 2) not null default 0,
  buffer_to_guilt_free numeric(14, 2) not null default 0,
  guilt_free_to_ef numeric(14, 2) not null default 0,
  guilt_free_to_investment numeric(14, 2) not null default 0,
  guilt_free_to_buffer numeric(14, 2) not null default 0,
  guilt_free_to_guilt_free numeric(14, 2) not null default 0,
  opening_buffer_next numeric(14, 2) not null default 0,
  opening_guilt_free_next numeric(14, 2) not null default 0,
  closed_at timestamptz not null default now(),
  reopened_at timestamptz
);

create index if not exists month_closes_closed_at_idx on month_closes (closed_at);

comment on table month_closes is
  'End-of-month close: freezes envelopes; Needs Side + Wants Side each allocate 100%.';
