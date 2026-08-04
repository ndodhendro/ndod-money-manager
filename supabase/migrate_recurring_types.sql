-- Recurring templates: expense / income / transfer.
-- Jalankan sekali di Supabase SQL Editor (setelah migrate_recurring_bills.sql).
-- Transfer membutuhkan migrate_buckets_transfer.sql (tabel buckets).

alter table recurring_bills
  add column if not exists type transaction_type not null default 'expense';

alter table recurring_bills
  add column if not exists from_bucket_id uuid references buckets(id) on delete set null;

alter table recurring_bills
  add column if not exists to_bucket_id uuid references buckets(id) on delete set null;

create index if not exists recurring_bills_type_idx on recurring_bills (type);
