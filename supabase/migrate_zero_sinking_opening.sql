-- Leftover opening_balance / opening_transfers inflated ledgers
-- (sinking funded progress, Investment Transit cash).
-- Emergency / Checking openings stay as-is (already 0).

update buckets
set
  opening_balance = 0,
  opening_transfers = 0
where kind in ('sinking', 'investment')
  and (
    opening_balance <> 0
    or opening_transfers <> 0
  );
