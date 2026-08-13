-- Buffer % of Planned Needs on Money Plan (Guilt-Free Fund allocation).
-- Safe to re-run.

alter table pyf_settings
  add column if not exists buffer_pct numeric(5, 2) not null default 10;

comment on column pyf_settings.buffer_pct is
  'Monthly Buffer as % of Planned Needs (overspend reserve before Guilt-Free Fund).';
