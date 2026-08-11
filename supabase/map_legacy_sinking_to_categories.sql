-- Map legacy sinking funds → expense subcategories.
-- Also ensures parent-category bank-mirror buckets and sets parent_id.
-- Review, then run in Supabase SQL Editor (one transaction).

begin;

-- ---------------------------------------------------------------------------
-- A) Ensure parent (bank-mirror) sinking buckets for parent categories
-- ---------------------------------------------------------------------------

insert into buckets (name, kind, icon, target_amount, opening_balance, budget_group, parent_id, category_id, sort_order, is_system, is_active)
select
  'Healths',
  'sinking',
  '🏥',
  null,
  0,
  'needs'::budget_group,
  null,
  '679693e4-54e6-4819-84fa-eb067ffc0134'::uuid,
  0,
  false,
  true
where not exists (
  select 1 from buckets b
  where b.category_id = '679693e4-54e6-4819-84fa-eb067ffc0134'::uuid
    and b.is_active = true
    and b.kind = 'sinking'
);

insert into buckets (name, kind, icon, target_amount, opening_balance, budget_group, parent_id, category_id, sort_order, is_system, is_active)
select
  'Gifts',
  'sinking',
  '🎁',
  null,
  0,
  'wants'::budget_group,
  null,
  '0cfc7d68-5612-4af8-9e92-22c78eda660c'::uuid,
  0,
  false,
  true
where not exists (
  select 1 from buckets b
  where b.category_id = '0cfc7d68-5612-4af8-9e92-22c78eda660c'::uuid
    and b.is_active = true
    and b.kind = 'sinking'
);

insert into buckets (name, kind, icon, target_amount, opening_balance, budget_group, parent_id, category_id, sort_order, is_system, is_active)
select
  'Legal Documents',
  'sinking',
  '📃',
  null,
  0,
  'needs'::budget_group,
  null,
  '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid,
  0,
  false,
  true
where not exists (
  select 1 from buckets b
  where b.category_id = '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid
    and b.is_active = true
    and b.kind = 'sinking'
);

insert into buckets (name, kind, icon, target_amount, opening_balance, budget_group, parent_id, category_id, sort_order, is_system, is_active)
select
  'Transportations',
  'sinking',
  '🚗',
  null,
  0,
  'needs'::budget_group,
  null,
  'de9150ce-ee1d-4a2d-9844-a2a2ea7c9031'::uuid,
  0,
  false,
  true
where not exists (
  select 1 from buckets b
  where b.category_id = 'de9150ce-ee1d-4a2d-9844-a2a2ea7c9031'::uuid
    and b.is_active = true
    and b.kind = 'sinking'
);

insert into buckets (name, kind, icon, target_amount, opening_balance, budget_group, parent_id, category_id, sort_order, is_system, is_active)
select
  'Housing',
  'sinking',
  '🏠',
  null,
  0,
  'needs'::budget_group,
  null,
  'a3fdf197-be3c-4390-873c-6f4400231982'::uuid,
  0,
  false,
  true
where not exists (
  select 1 from buckets b
  where b.category_id = 'a3fdf197-be3c-4390-873c-6f4400231982'::uuid
    and b.is_active = true
    and b.kind = 'sinking'
);

insert into buckets (name, kind, icon, target_amount, opening_balance, budget_group, parent_id, category_id, sort_order, is_system, is_active)
select
  'Lifestyle',
  'sinking',
  '🎉',
  null,
  0,
  'needs'::budget_group,
  null,
  'eee28822-1545-4a30-b034-eb5dd8b3e90e'::uuid,
  0,
  false,
  true
where not exists (
  select 1 from buckets b
  where b.category_id = 'eee28822-1545-4a30-b034-eb5dd8b3e90e'::uuid
    and b.is_active = true
    and b.kind = 'sinking'
);

-- ---------------------------------------------------------------------------
-- B) Map leaf sinking funds to subcategories + sync name/icon + parent_id
-- ---------------------------------------------------------------------------

update buckets b
set
  category_id = '7b6af959-633c-4d51-9a28-83b7c96c360e'::uuid,
  name = 'Haircut',
  icon = '💇🏻',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '679693e4-54e6-4819-84fa-eb067ffc0134'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'a328c827-84f0-4240-b430-0e91de74dc02'::uuid;

update buckets b
set
  category_id = '94d796e8-823e-4409-ab4c-e0788b106647'::uuid,
  name = 'Makeup',
  icon = '💄',
  budget_group = 'wants'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '679693e4-54e6-4819-84fa-eb067ffc0134'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'c61584c2-8fe7-43b6-b1f5-db2fde7d0f64'::uuid;

update buckets b
set
  category_id = '81102e78-3639-4cc7-87dc-441026683a0b'::uuid,
  name = 'Religious Offerings',
  icon = '🙏🏻',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '0cfc7d68-5612-4af8-9e92-22c78eda660c'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'bbb81b0c-3ff5-4a6a-a708-76afc03dcd22'::uuid;

update buckets b
set
  category_id = '4d25eba2-c843-42e0-ae7d-d9c7573b6c85'::uuid,
  name = 'Skin Care',
  icon = '💫',
  budget_group = 'wants'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '679693e4-54e6-4819-84fa-eb067ffc0134'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'e22fde33-8014-4e01-a642-6df8fff52bc7'::uuid;

update buckets b
set
  category_id = '615e44ed-fdfa-46e9-a1f0-4abcacb5192d'::uuid,
  name = 'Softlens',
  icon = '👀',
  budget_group = 'wants'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '679693e4-54e6-4819-84fa-eb067ffc0134'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '717de774-2e4b-4809-9649-eeb44278a725'::uuid;

update buckets b
set
  category_id = '10eeef56-0bbf-496f-829d-392baa21d9f7'::uuid,
  name = 'Car Lic Plate',
  icon = '🔢',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '6d70b0a3-db19-4eb6-9f27-5215c9eff609'::uuid;

update buckets b
set
  category_id = '3452344a-fe0d-4463-bb65-2ad91c4351fa'::uuid,
  name = 'Car Service',
  icon = '🛠️',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = 'de9150ce-ee1d-4a2d-9844-a2a2ea7c9031'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '5d88af45-5847-46ba-8518-599e2e7091ee'::uuid;

update buckets b
set
  category_id = '31df5aba-2263-4d9c-954f-244bae901ae6'::uuid,
  name = 'Car Tax',
  icon = '📋',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'f5dda59c-407c-425d-b610-356bf9f7d5d9'::uuid;

update buckets b
set
  category_id = '78266d7e-5a5a-4790-be3e-3b67edd34bd2'::uuid,
  name = 'Cash Parking',
  icon = '🅿️',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = 'de9150ce-ee1d-4a2d-9844-a2a2ea7c9031'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'fc03c397-2705-42c8-b88a-fe55760846b6'::uuid;

update buckets b
set
  category_id = 'fd6ab922-adae-4398-8c12-f04c933ada9b'::uuid,
  name = 'Motorcycle Lic Plate',
  icon = '🔢',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '9b9671ed-2fbe-4d8e-ac07-6ba26147ede1'::uuid;

update buckets b
set
  category_id = 'b1a67f48-8f25-4fa5-b146-80ec2578b02f'::uuid,
  name = 'Motorcycle Service',
  icon = '🛠️',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = 'de9150ce-ee1d-4a2d-9844-a2a2ea7c9031'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '51fbd495-28bb-4501-9d07-cbc9f6cb426e'::uuid;

update buckets b
set
  category_id = '31979a93-a7ed-4f5f-941f-7b73947e48ff'::uuid,
  name = 'Motorcycle Tax',
  icon = '📋',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '33ece196-7868-43bf-befe-0d1475fb0d4a'::uuid;

update buckets b
set
  category_id = 'd4e70eb6-51e0-46e0-b09b-202a8d85cb18'::uuid,
  name = 'Passport',
  icon = '📗',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '2a094693-4d33-442b-ab4f-319bf17df8d6'::uuid;

update buckets b
set
  category_id = 'b6df65c8-683c-4cdf-9e0e-a9dfe68c0674'::uuid,
  name = 'SIM A',
  icon = '🅰️',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '61456ba9-64f8-45b0-8943-883ce3bfa364'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '163849e9-4b59-4a80-8d13-9fb49107108a'::uuid;

update buckets b
set
  category_id = '82b63d85-fc9e-4437-8614-2fe5855a72ab'::uuid,
  name = 'AC Maintenance',
  icon = '❄️',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = 'a3fdf197-be3c-4390-873c-6f4400231982'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '0ccbea87-db22-4ca0-81cb-0b2cd9d5fb70'::uuid;

update buckets b
set
  category_id = '44a17a74-5172-4beb-bf2d-acb71f1b3442'::uuid,
  name = 'Family Gift',
  icon = '🎀',
  budget_group = 'wants'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '0cfc7d68-5612-4af8-9e92-22c78eda660c'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '53d966a4-a67a-4c5b-9c15-dcf8a6813b18'::uuid;

update buckets b
set
  category_id = '82f286cf-a2a6-4bfd-8b1b-50120cfda32d'::uuid,
  name = 'Imlek''s Angpao',
  icon = '🧧',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '0cfc7d68-5612-4af8-9e92-22c78eda660c'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '34e97fc7-f01e-410d-9dc8-0b77f4b6b54f'::uuid;

update buckets b
set
  category_id = '3b1fc2a2-5360-4586-ad92-5bd256bc2789'::uuid,
  name = 'Imlek''s Clothes',
  icon = '👚',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = 'eee28822-1545-4a30-b034-eb5dd8b3e90e'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '52ebfba6-a37d-43cd-87c1-ab540dd011d0'::uuid;

update buckets b
set
  category_id = 'b4b1bc3c-98a1-4c15-8db8-a8d8f90d4165'::uuid,
  name = 'Parents'' Imlek Clothes',
  icon = '👚',
  budget_group = 'needs'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '0cfc7d68-5612-4af8-9e92-22c78eda660c'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'c0f1f4bf-6f05-4af3-a60a-713d0f2998ef'::uuid;

update buckets b
set
  category_id = 'ca5eb66d-6752-49d9-a5e6-c4aed7191c80'::uuid,
  name = 'Subscription',
  icon = '🧾',
  budget_group = 'wants'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = 'eee28822-1545-4a30-b034-eb5dd8b3e90e'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = 'ac6f26d2-a29a-46be-a0b3-1565e332fdd5'::uuid;

-- ---------------------------------------------------------------------------
-- C) Verify
-- ---------------------------------------------------------------------------
select
  b.name as bucket_name,
  b.icon,
  c.name as subcategory,
  pc.name as parent_category,
  pb.name as parent_bucket,
  b.category_id,
  b.parent_id
from buckets b
left join categories c on c.id = b.category_id
left join categories pc on pc.id = c.parent_id
left join buckets pb on pb.id = b.parent_id
where b.kind = 'sinking'
  and b.is_active = true
order by pc.name nulls first, b.name;

commit;
