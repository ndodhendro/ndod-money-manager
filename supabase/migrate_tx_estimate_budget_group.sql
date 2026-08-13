-- Needs/Wants on each expense transaction and monthly estimate.
-- Subcategory still holds the default; instance can override.
-- Safe to re-run.

alter table transactions
  add column if not exists budget_group budget_group;

alter table recurring_bills
  add column if not exists budget_group budget_group;

comment on column transactions.budget_group is
  'Expense Needs/Wants for this transaction. Null = inherit subcategory default.';

comment on column recurring_bills.budget_group is
  'Expense Needs/Wants for this estimate line. Null = inherit subcategory default.';

-- Backfill from category (then parent) so existing rows keep current reporting.
update transactions t
set budget_group = coalesce(c.budget_group, p.budget_group)
from categories c
left join categories p on p.id = c.parent_id
where t.type = 'expense'
  and t.category_id = c.id
  and t.budget_group is null
  and coalesce(c.budget_group, p.budget_group) in ('needs', 'wants');

update recurring_bills b
set budget_group = coalesce(c.budget_group, p.budget_group)
from categories c
left join categories p on p.id = c.parent_id
where b.type = 'expense'
  and b.category_id = c.id
  and b.budget_group is null
  and coalesce(c.budget_group, p.budget_group) in ('needs', 'wants');

notify pgrst, 'reload schema';
