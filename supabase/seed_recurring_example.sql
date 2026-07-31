-- OPSIONAL: import satu kali item rutin dari "Budget Rumah Tangga HD.xlsx"
-- supaya bulan pertama pakai app tidak mulai dari nol. Bukan fitur import
-- otomatis - sesuaikan nominal & tanggal, lalu jalankan sekali di SQL Editor.
-- Jalankan setelah schema.sql + seed.sql.

insert into transactions (type, category_id, amount, description, owner, occurred_on, is_recurring)
values
  ('income', (select id from categories where name = 'Gaji Pokok'), 17000000, 'Gaji bulanan kantor - Ndod', 'suami', date_trunc('month', current_date)::date, true),

  ('expense', (select id from categories where name = 'Kebutuhan Pokok'), 4500000, 'Kebutuhan pokok rumah tangga', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Tempat Tinggal'), 3000000, 'KPR Northbend C1', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Cicilan / Utang'), 300000, 'Filter air torrent Coway', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Cicilan / Utang'), 1434000, 'HP baru Devi', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Transportasi'), 1750000, 'Bensin Mobil + E-money', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Transportasi'), 150000, 'Service Mobil (proporsional per bulan)', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Transportasi'), 125000, 'Pajak Mobil (proporsional per bulan)', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Kesehatan'), 750000, 'Asuransi Kesehatan Hendro', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Hiburan & Gaya Hidup'), 46500, 'Netflix', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Hiburan & Gaya Hidup'), 69000, 'Dota+', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Hiburan & Gaya Hidup'), 30000, 'Google Drive', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Hiburan & Gaya Hidup'), 300000, 'Jajan Hendro', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Dana Paramita'), 500000, 'Bulanan Mama Hendro', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Dana Paramita'), 70000, 'Shelter Doggy', 'suami', date_trunc('month', current_date)::date, true),
  ('expense', (select id from categories where name = 'Skill Development'), 750000, 'Research Saham', 'suami', date_trunc('month', current_date)::date, true);
