-- Add sinking_fund source for EF loans when a sinking-fund expense exceeds balance.
-- Safe to re-run.

alter type ef_loan_source add value if not exists 'sinking_fund';

comment on table ef_loans is
  'Buffer/Guilt-Free/Sinking-Fund overspend borrowed from Emergency Fund (available EF = ledger − open outstanding).';
