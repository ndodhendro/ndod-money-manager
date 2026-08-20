-- Allow users to specify how many recurring sinking transfers have already
-- happened when entering opening_balance mid-plan.
--
-- This keeps Plan > Savings Goals pacing aligned with the real-world state.

alter table buckets
  add column if not exists opening_transfers integer not null default 0;

