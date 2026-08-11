-- Inspect + sync sinking fund name/icon from linked categories.
-- Run in Supabase SQL Editor.

-- =============================================================================
-- 1) UNMAPPED: active sinking funds without category_id (or broken link)
-- =============================================================================
select
  b.id as bucket_id,
  b.name as bucket_name,
  b.icon as bucket_icon,
  b.parent_id,
  b.category_id,
  case
    when b.category_id is null then 'unmapped'
    when c.id is null then 'category_missing'
    else 'ok'
  end as mapping_status
from buckets b
left join categories c on c.id = b.category_id
where b.kind = 'sinking'
  and b.is_active = true
  and (b.category_id is null or c.id is null)
order by b.name;

-- =============================================================================
-- 2) PREVIEW: mapped rows where name/icon differ from category
-- =============================================================================
select
  b.id as bucket_id,
  b.name as bucket_name,
  c.name as category_name,
  b.icon as bucket_icon,
  c.icon as category_icon,
  case when c.parent_id is null then 'main_category' else 'subcategory' end as category_level
from buckets b
join categories c on c.id = b.category_id
where b.kind = 'sinking'
  and b.is_active = true
  and (
    b.name is distinct from c.name
    or b.icon is distinct from c.icon
  )
order by c.parent_id nulls first, c.name;

-- =============================================================================
-- 3) UPDATE: sync name + icon from linked category (mapped only)
-- =============================================================================
update buckets b
set
  name = c.name,
  icon = coalesce(nullif(trim(c.icon), ''), b.icon)
from categories c
where b.category_id = c.id
  and b.kind = 'sinking'
  and b.is_active = true
  and (
    b.name is distinct from c.name
    or b.icon is distinct from coalesce(nullif(trim(c.icon), ''), b.icon)
  );
