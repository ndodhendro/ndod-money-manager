-- Seed kategori final (income tetap + expense struktur baru).
-- Aman dijalankan ulang HANYA di DB kosong / setelah hapus categories.
-- Untuk rebuild penuh dari app testing: node scripts/rebuild-categories.mjs

-- Parent (root)
insert into categories (name, type, budget_group, icon, sort_order, parent_id)
select v.name, v.type::transaction_type, v.budget_group::budget_group, v.icon, v.sort_order, null
from (values
  ('Gaji Pokok', 'income', null, '💰', 1),
  ('Bonus / THR', 'income', null, '🎁', 2),
  ('Usaha Sampingan', 'income', null, '🧾', 3),
  ('Pemasukan Lainnya', 'income', null, '➕', 4),
  ('Kebutuhan Pokok', 'expense', 'needs', '🛒', 10),
  ('Tempat Tinggal', 'expense', 'needs', '🏠', 11),
  ('Transportasi', 'expense', 'needs', '🚗', 12),
  ('Cicilan / Utang', 'expense', 'needs', '💳', 13),
  ('Gaya Hidup', 'expense', 'wants', '✨', 14),
  ('Pakaian', 'expense', 'wants', '👕', 15),
  ('HP', 'expense', 'wants', '📱', 16),
  ('Barang Rumah', 'expense', 'wants', '🛋️', 17),
  ('Peliharaan', 'expense', 'wants', '🐾', 18),
  ('Kesehatan', 'expense', 'needs', '🏥', 19),
  ('Kado', 'expense', 'needs', '🎁', 20),
  ('Keluarga HD', 'expense', 'wants', '👨‍👩‍👧', 21),
  ('Keluarga H', 'expense', 'wants', '👨', 22),
  ('Keluarga D', 'expense', 'wants', '👩', 23),
  ('Pengembangan', 'expense', 'wants', '📚', 24),
  ('Teman', 'expense', 'wants', '👥', 25),
  ('Lainnya', 'expense', 'wants', '📦', 26)
) as v(name, type, budget_group, icon, sort_order)
where not exists (
  select 1 from categories c where c.name = v.name and c.parent_id is null
);

-- Sub-kategori
insert into categories (name, type, budget_group, icon, sort_order, parent_id)
select v.name, p.type, p.budget_group, v.icon, v.sort_order, p.id
from categories p
join (values
  ('Gaji Pokok', 'Gaji Bulanan', '💰', 1),
  ('Bonus / THR', 'THR', '🎁', 1),
  ('Bonus / THR', 'Bonus Kinerja', '🏆', 2),
  ('Usaha Sampingan', 'Proyek', '💼', 1),
  ('Pemasukan Lainnya', 'Transfer / Hadiah', '➕', 1),
  ('Tempat Tinggal', 'KPR', '🏦', 1),
  ('Tempat Tinggal', 'Renovasi', '🔨', 2),
  ('Tempat Tinggal', 'Perawatan', '🔧', 3),
  ('Transportasi', 'E-Money', '💳', 1),
  ('Transportasi', 'Bensin Mobil', '⛽', 2),
  ('Transportasi', 'Bensin Motor', '🛵', 3),
  ('Transportasi', 'Parkir Cash', '🅿️', 4),
  ('Transportasi', 'Cuci Mobil', '🚿', 5),
  ('Transportasi', 'Cuci Motor', '🧼', 6),
  ('Transportasi', 'Service Mobil', '🛠️', 7),
  ('Transportasi', 'Service Motor', '🔩', 8),
  ('Transportasi', 'Pajak Mobil', '📄', 9),
  ('Transportasi', 'Pajak Motor', '📋', 10),
  ('Transportasi', 'Transportasi Umum', '🚌', 11),
  ('Cicilan / Utang', 'Filter Air Coway', '💧', 1),
  ('Cicilan / Utang', 'HP', '📱', 2),
  ('Cicilan / Utang', 'Lainnya', '💳', 9),
  ('Gaya Hidup', 'Hiburan', '🎬', 1),
  ('Gaya Hidup', 'Gaming', '🎮', 2),
  ('Gaya Hidup', 'Hobi', '🎨', 3),
  ('Pakaian', 'Baju', '👔', 1),
  ('Pakaian', 'Celana', '👖', 2),
  ('Pakaian', 'Pakaian Dalam', '🩲', 3),
  ('Pakaian', 'Alas Kaki', '👟', 4),
  ('Pakaian', 'Tas', '👜', 5),
  ('Pakaian', 'Aksesoris', '💍', 6),
  ('Pakaian', 'Laundry', '🧺', 7),
  ('HP', 'Pulsa', '📞', 1),
  ('HP', 'Internet', '📶', 2),
  ('HP', 'Roaming', '🌏', 3),
  ('HP', 'Aksesoris', '🎧', 4),
  ('Barang Rumah', 'Dapur', '🍳', 1),
  ('Barang Rumah', 'Kamar Tidur', '🛏️', 2),
  ('Barang Rumah', 'Kamar Mandi', '🛁', 3),
  ('Barang Rumah', 'Ruang Makan', '🍽️', 4),
  ('Barang Rumah', 'Teras', '🪴', 5),
  ('Peliharaan', 'Makanan', '🦴', 1),
  ('Peliharaan', 'Mainan', '🎾', 2),
  ('Peliharaan', 'Aksesoris', '🦮', 3),
  ('Kesehatan', 'Potong Rambut', '💇', 1),
  ('Kesehatan', 'Pijat', '💆', 2),
  ('Kesehatan', 'Perawatan', '💅', 3),
  ('Kesehatan', 'Obat', '💊', 4),
  ('Kesehatan', 'Seksual', '🔒', 5),
  ('Kado', 'Dana Paramita', '🙏', 1),
  ('Kado', 'Bulanan Mama H', '👩', 2),
  ('Kado', 'Bulanan Mama D', '👵', 3),
  ('Kado', 'Kado Keluarga H', '🎀', 4),
  ('Kado', 'Kado Keluarga D', '🎀', 5),
  ('Kado', 'Kado Teman H', '🤝', 6),
  ('Kado', 'Kado Teman D', '🤝', 7),
  ('Kado', 'Tips', '💵', 8),
  ('Keluarga HD', 'Makan', '🍜', 1),
  ('Keluarga HD', 'Jajan', '🍪', 2),
  ('Keluarga HD', 'Hiburan', '🎢', 3),
  ('Keluarga HD', 'Liburan', '✈️', 4),
  ('Keluarga HD', 'Olahraga', '🏃', 5),
  ('Keluarga H', 'Makan', '🍜', 1),
  ('Keluarga H', 'Jajan', '🍪', 2),
  ('Keluarga H', 'Hiburan', '🎢', 3),
  ('Keluarga H', 'Liburan', '✈️', 4),
  ('Keluarga H', 'Olahraga', '🏃', 5),
  ('Keluarga D', 'Makan', '🍜', 1),
  ('Keluarga D', 'Jajan', '🍪', 2),
  ('Keluarga D', 'Hiburan', '🎢', 3),
  ('Keluarga D', 'Liburan', '✈️', 4),
  ('Keluarga D', 'Olahraga', '🏃', 5),
  ('Pengembangan', 'Riset', '🔍', 1),
  ('Pengembangan', 'Buku', '📖', 2),
  ('Pengembangan', 'Kursus', '🎓', 3),
  ('Teman', 'Makan', '🍜', 1),
  ('Teman', 'Jajan', '🍪', 2),
  ('Teman', 'Hiburan', '🎢', 3),
  ('Teman', 'Liburan', '✈️', 4),
  ('Teman', 'Olahraga', '🏃', 5)
) as v(parent_name, name, icon, sort_order)
  on p.name = v.parent_name and p.parent_id is null
where not exists (
  select 1 from categories c
  where c.parent_id = p.id and c.name = v.name
);
