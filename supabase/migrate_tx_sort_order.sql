-- Intra-day order for History (morning → evening) and Overspend labels.
-- Safe to re-run.

alter table transactions
  add column if not exists sort_order integer not null default 0;

comment on column transactions.sort_order is
  'Order within occurred_on. Lower = earlier that day (top of History).';

create index if not exists transactions_occurred_on_sort_idx
  on transactions (occurred_on, sort_order);

-- Existing rows: first created that day = morning (top).
with ranked as (
  select
    id,
    row_number() over (
      partition by occurred_on
      order by created_at asc, id asc
    ) as rn
  from transactions
)
update transactions t
set sort_order = ranked.rn
from ranked
where t.id = ranked.id;

notify pgrst, 'reload schema';
