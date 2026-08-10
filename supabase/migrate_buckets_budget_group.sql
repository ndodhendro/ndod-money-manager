-- Sinking funds: Needs / Wants flag for Money Plan planned needs & committed wants.
-- Emergency / Investment stay null (PYF savings).

alter table buckets
  add column if not exists budget_group budget_group;

comment on column buckets.budget_group is
  'Needs/Wants for sinking funds only; null for emergency/investment system buckets.';

-- Existing sinking funds start as Needs; change in Settings → Savings Buckets if Wants.
update buckets
set budget_group = 'needs'
where kind = 'sinking'
  and budget_group is null;
