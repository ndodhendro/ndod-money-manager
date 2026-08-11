-- Link sinking funds to expense categories (subcategory = leaf bucket;
-- parent category = auto parent / bank-mirror bucket).

alter table buckets
  add column if not exists category_id uuid references categories(id) on delete restrict;

create index if not exists buckets_category_id_idx on buckets (category_id);

create unique index if not exists buckets_active_category_uidx
  on buckets (category_id)
  where is_active = true and category_id is not null;

comment on column buckets.category_id is
  'Expense category this sinking fund mirrors. Subcategory = leaf; parent category = bank-mirror parent bucket.';
