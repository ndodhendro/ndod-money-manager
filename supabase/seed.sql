-- Seed kategori awal, dipetakan dari "Budget Rumah Tangga HD.xlsx".
-- Jalankan setelah schema.sql. Aman dijalankan ulang (on conflict do nothing).

insert into categories (name, type, budget_group, icon, sort_order) values
  ('Gaji Pokok', 'income', null, '💰', 1),
  ('Bonus / THR', 'income', null, '🎁', 2),
  ('Usaha Sampingan', 'income', null, '🧾', 3),
  ('Pemasukan Lainnya', 'income', null, '➕', 4),

  ('Kebutuhan Pokok', 'expense', 'needs', '🛒', 10),
  ('Tempat Tinggal', 'expense', 'needs', '🏠', 11),
  ('Utilitas', 'expense', 'needs', '💡', 12),
  ('Transportasi', 'expense', 'needs', '🚗', 13),
  ('Cicilan / Utang', 'expense', 'needs', '💳', 14),
  ('Kesehatan', 'expense', 'needs', '🏥', 15),
  ('Dana Paramita', 'expense', 'needs', '❤️', 16),

  ('Hiburan & Gaya Hidup', 'expense', 'wants', '🎮', 20),
  ('Skill Development', 'expense', 'wants', '📚', 21),
  ('Lain-lain', 'expense', 'wants', '📦', 22)
on conflict (name) do nothing;
