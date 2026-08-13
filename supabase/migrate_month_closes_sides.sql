-- Close Month: Needs Side + Wants Side leftover pools (2×4 allocation).
-- Safe to re-run. Adds columns alongside legacy buffer_to_* / guilt_free_to_*.

alter table month_closes
  add column if not exists planned_needs_remaining numeric(14, 2) not null default 0;

alter table month_closes
  add column if not exists planned_wants_remaining numeric(14, 2) not null default 0;

alter table month_closes
  add column if not exists needs_side_to_ef numeric(14, 2) not null default 0;
alter table month_closes
  add column if not exists needs_side_to_investment numeric(14, 2) not null default 0;
alter table month_closes
  add column if not exists needs_side_to_buffer numeric(14, 2) not null default 0;
alter table month_closes
  add column if not exists needs_side_to_guilt_free numeric(14, 2) not null default 0;

alter table month_closes
  add column if not exists wants_side_to_ef numeric(14, 2) not null default 0;
alter table month_closes
  add column if not exists wants_side_to_investment numeric(14, 2) not null default 0;
alter table month_closes
  add column if not exists wants_side_to_buffer numeric(14, 2) not null default 0;
alter table month_closes
  add column if not exists wants_side_to_guilt_free numeric(14, 2) not null default 0;

comment on column month_closes.planned_needs_remaining is
  'Planned Needs underspend at close (part of Needs Side leftover).';
comment on column month_closes.needs_side_to_ef is
  'Allocation of Needs Side leftover (Planned Needs rem + Buffer rem) to EF.';
comment on column month_closes.wants_side_to_guilt_free is
  'Allocation of Wants Side leftover (Planned Wants rem + Guilt-Free rem) to Guilt-Free.';
