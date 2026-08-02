-- Migration: add transaction circle (HD Family / Extended Family / Friends)
-- Run once in Supabase SQL Editor on an existing project.
-- Existing rows inherit default hd_family (HD Family).

do $$ begin
  create type circle_type as enum ('hd_family', 'extended_family', 'friends');
exception when duplicate_object then null; end $$;

alter table transactions
  add column if not exists circle circle_type not null default 'hd_family';

create index if not exists transactions_circle_idx on transactions (circle);
