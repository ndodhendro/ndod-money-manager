-- Categories: allow duplicate names among inactive rows; one active per type+name+parent.
-- Run once in Supabase SQL Editor.

drop index if exists categories_name_parent_uidx;

create unique index if not exists categories_name_parent_active_uidx
  on categories (
    type,
    name,
    (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where is_active = true;
