-- Retire personal checking accounts (Ndod Account / Devi Account).
-- Free Guilty is a single shared pool; Main Account holds available cash.
-- Safe to re-run.

-- Soft-deactivate system checking buckets.
update buckets
set is_active = false
where kind = 'checking'
  and is_system = true
  and is_active = true;

-- Soft-deactivate Monthly Estimates that transfer into those accounts.
update recurring_bills
set is_active = false
where is_active = true
  and type = 'transfer'
  and to_bucket_id in (
    select id from buckets
    where kind = 'checking' and is_system = true
  );
