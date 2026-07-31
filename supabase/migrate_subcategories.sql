-- Migrasi: dukung sub-kategori 1 level (parent_id).
-- Jalankan sekali di Supabase SQL Editor pada project yang sudah ada.

alter table categories
  add column if not exists parent_id uuid references categories(id) on delete cascade;

-- Ganti unique name global → unique per parent (supaya "Lainnya" boleh di beberapa parent).
alter table categories drop constraint if exists categories_name_key;
alter table categories drop constraint if exists categories_name_parent_unique;

-- Unique partial: nama unik di antara sibling (parent_id sama), termasuk root (parent_id null).
create unique index if not exists categories_name_parent_uidx
  on categories (name, (coalesce(parent_id, '00000000-0000-0000-0000-000000000000')));

create index if not exists categories_parent_id_idx on categories (parent_id);

-- ============================================================
-- Seed sub-kategori di bawah parent yang sudah ada (dari seed awal).
-- Aman dijalankan ulang: on conflict do nothing via not exists.
-- ============================================================

-- Helper: insert child jika parent ada & child belum ada
insert into categories (name, type, budget_group, icon, sort_order, parent_id)
select v.name, p.type, p.budget_group, v.icon, v.sort_order, p.id
from categories p
join (values
  -- Kebutuhan Pokok
  ('Kebutuhan Pokok', 'Belanja Rumah Tangga', '🛒', 1),
  ('Kebutuhan Pokok', 'Makan di Luar', '🍜', 2),

  -- Tempat Tinggal
  ('Tempat Tinggal', 'KPR', '🏠', 1),
  ('Tempat Tinggal', 'Renovasi / Perawatan', '🔧', 2),

  -- Utilitas
  ('Utilitas', 'Listrik', '⚡', 1),
  ('Utilitas', 'Air', '💧', 2),
  ('Utilitas', 'Internet / WiFi', '📶', 3),
  ('Utilitas', 'Gas', '🔥', 4),

  -- Transportasi
  ('Transportasi', 'Bensin & E-money', '⛽', 1),
  ('Transportasi', 'Parkir', '🅿️', 2),
  ('Transportasi', 'Service Mobil', '🛠️', 3),
  ('Transportasi', 'Pajak Mobil', '📄', 4),
  ('Transportasi', 'Bensin Motor', '🛵', 5),
  ('Transportasi', 'Cuci Mobil', '🚿', 6),

  -- Cicilan / Utang
  ('Cicilan / Utang', 'Filter Air Coway', '💧', 1),
  ('Cicilan / Utang', 'HP', '📱', 2),
  ('Cicilan / Utang', 'Lainnya', '💳', 9),

  -- Kesehatan
  ('Kesehatan', 'Asuransi', '🩺', 1),
  ('Kesehatan', 'Obat / Klinik', '💊', 2),

  -- Dana Paramita
  ('Dana Paramita', 'Mama Hendro', '👩', 1),
  ('Dana Paramita', 'Shelter Doggy', '🐶', 2),
  ('Dana Paramita', 'Sumbangan Lain', '❤️', 3),

  -- Hiburan & Gaya Hidup
  ('Hiburan & Gaya Hidup', 'Netflix', '📺', 1),
  ('Hiburan & Gaya Hidup', 'Dota+', '🎮', 2),
  ('Hiburan & Gaya Hidup', 'Google Drive', '☁️', 3),
  ('Hiburan & Gaya Hidup', 'Jajan', '🍪', 4),
  ('Hiburan & Gaya Hidup', 'Lainnya', '✨', 9),

  -- Skill Development
  ('Skill Development', 'Research Saham', '📈', 1),
  ('Skill Development', 'Kursus / Buku', '📖', 2),

  -- Lain-lain
  ('Lain-lain', 'Tak Terduga', '❓', 1),
  ('Lain-lain', 'Administrasi', '📎', 2),

  -- Income
  ('Gaji Pokok', 'Gaji Bulanan', '💰', 1),
  ('Bonus / THR', 'THR', '🎁', 1),
  ('Bonus / THR', 'Bonus Kinerja', '🏆', 2),
  ('Usaha Sampingan', 'Proyek', '💼', 1),
  ('Pemasukan Lainnya', 'Transfer / Hadiah', '➕', 1)
) as v(parent_name, name, icon, sort_order)
  on p.name = v.parent_name and p.parent_id is null
where not exists (
  select 1 from categories c
  where c.parent_id = p.id and c.name = v.name
);
