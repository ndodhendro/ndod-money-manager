-- Part 1: add bucket_kind 'checking'.
-- Run this alone in Supabase SQL Editor, then run
-- migrate_buckets_checking_accounts_seed.sql in a NEW query.
-- (Postgres forbids using a new enum value in the same transaction as ADD VALUE.)

alter type bucket_kind add value if not exists 'checking';
