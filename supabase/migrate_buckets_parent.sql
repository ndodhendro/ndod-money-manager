-- Sinking funds: optional 2-level hierarchy (parent = bank mirror, child = detail).
-- Leaves-only money model is enforced in the app (parent with children is not a transfer target).

alter table buckets
  add column if not exists parent_id uuid references buckets(id) on delete restrict;

create index if not exists buckets_parent_id_idx on buckets (parent_id);

comment on column buckets.parent_id is
  'Optional parent sinking fund (max depth 2). Null = top-level / bank-mirror bucket.';

-- Enforce: only sinking may have a parent; parent must be a root sinking fund.
create or replace function buckets_validate_parent()
returns trigger
language plpgsql
as $$
declare
  parent_row buckets%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.kind <> 'sinking' then
    raise exception 'Only sinking funds may have a parent';
  end if;

  if new.is_system then
    raise exception 'System buckets cannot be children';
  end if;

  if new.parent_id = new.id then
    raise exception 'Bucket cannot be its own parent';
  end if;

  select * into parent_row from buckets where id = new.parent_id;
  if not found then
    raise exception 'Parent bucket not found';
  end if;

  if parent_row.kind <> 'sinking' then
    raise exception 'Parent must be a sinking fund';
  end if;

  if parent_row.is_system then
    raise exception 'System buckets cannot be parents';
  end if;

  if parent_row.parent_id is not null then
    raise exception 'Bucket hierarchy is limited to 2 levels';
  end if;

  return new;
end;
$$;

drop trigger if exists buckets_validate_parent_trg on buckets;
create trigger buckets_validate_parent_trg
  before insert or update of parent_id, kind, is_system
  on buckets
  for each row
  execute function buckets_validate_parent();
