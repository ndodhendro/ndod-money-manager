-- Keep Amount-mode Money Plan values exact after reload.
-- numeric(5, 2) rounded 250000 / income to ~2.99% and reconstructed 249xxx.
-- Safe to re-run.

alter table pyf_settings
  alter column emergency_fund_pct type numeric(12, 6),
  alter column investment_pct type numeric(12, 6),
  alter column buffer_pct type numeric(12, 6);
