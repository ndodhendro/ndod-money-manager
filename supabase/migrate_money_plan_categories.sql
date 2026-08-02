-- Money Plan step 2/2 — jalankan SETELAH step 1 sukses (file migrate_money_plan.sql).

insert into categories (name, type, budget_group, icon, sort_order, parent_id)
select 'Savings', 'expense', 'savings', '🏦', 9, null
where not exists (
  select 1 from categories c where c.name = 'Savings' and c.parent_id is null
);

update categories
set budget_group = 'savings'
where name = 'Savings' and parent_id is null and budget_group is distinct from 'savings';

insert into categories (name, type, budget_group, icon, sort_order, parent_id)
select v.name, p.type, 'savings'::budget_group, v.icon, v.sort_order, p.id
from categories p
join (values
  ('Emergency Fund', '🛟', 1),
  ('Investment', '📈', 2)
) as v(name, icon, sort_order) on true
where p.name = 'Savings' and p.parent_id is null
  and not exists (
    select 1 from categories c
    where c.parent_id = p.id and c.name = v.name
  );

update categories c
set budget_group = 'savings'
from categories p
where c.parent_id = p.id
  and p.name = 'Savings' and p.parent_id is null
  and c.name in ('Emergency Fund', 'Investment')
  and c.budget_group is distinct from 'savings';
