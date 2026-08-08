-- Categories: unique active name includes budget_group (Needs/Wants/Savings).
-- Same name may exist under different groups; still unique within type + parent + group.
-- Split indexes avoid enum→text cast (not IMMUTABLE) in index expressions.
-- Run once in Supabase SQL Editor on an existing project.

drop index if exists categories_name_parent_active_uidx;
drop index if exists categories_name_parent_budget_active_uidx;

-- Expense: unique per type + name + parent + Needs/Wants/Savings
create unique index if not exists categories_name_parent_budget_active_uidx
  on categories (
    type,
    name,
    (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    budget_group
  )
  where is_active = true and budget_group is not null;

-- Income (budget_group null): unique per type + name + parent
create unique index if not exists categories_name_parent_active_null_budget_uidx
  on categories (
    type,
    name,
    (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where is_active = true and budget_group is null;
