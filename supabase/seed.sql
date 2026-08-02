-- Seed categories (English). Safe to re-run only on empty DB / after clearing categories.
-- For in-place rename of existing Indonesian names: node scripts/rename-categories-en.mjs
-- Full rebuild (truncates transactions): node scripts/rebuild-categories.mjs

-- Parent (root)
insert into categories (name, type, budget_group, icon, sort_order, parent_id)
select v.name, v.type::transaction_type, v.budget_group::budget_group, v.icon, v.sort_order, null
from (values
  ('Base Salary', 'income', null, '💰', 1),
  ('Bonus / Holiday Bonus', 'income', null, '🎁', 2),
  ('Side Business', 'income', null, '🧾', 3),
  ('Other Income', 'income', null, '➕', 4),
  ('Savings', 'expense', 'savings', '🏦', 9),
  ('Essentials', 'expense', 'needs', '🛒', 10),
  ('Housing', 'expense', 'needs', '🏠', 11),
  ('Transportation', 'expense', 'needs', '🚗', 12),
  ('Installments / Debt', 'expense', 'needs', '💳', 13),
  ('Lifestyle', 'expense', 'wants', '✨', 14),
  ('Clothing', 'expense', 'wants', '👕', 15),
  ('Phone', 'expense', 'wants', '📱', 16),
  ('Home Goods', 'expense', 'wants', '🛋️', 17),
  ('Pets', 'expense', 'wants', '🐾', 18),
  ('Health', 'expense', 'needs', '🏥', 19),
  ('Gifts', 'expense', 'needs', '🎁', 20),
  ('Family HD', 'expense', 'wants', '👨‍👩‍👧', 21),
  ('Family H', 'expense', 'wants', '👨', 22),
  ('Family D', 'expense', 'wants', '👩', 23),
  ('Personal Growth', 'expense', 'wants', '📚', 24),
  ('Friends', 'expense', 'wants', '👥', 25),
  ('Other', 'expense', 'wants', '📦', 26)
) as v(name, type, budget_group, icon, sort_order)
where not exists (
  select 1 from categories c where c.name = v.name and c.parent_id is null
);

-- Subcategories
insert into categories (name, type, budget_group, icon, sort_order, parent_id)
select v.name, p.type, p.budget_group, v.icon, v.sort_order, p.id
from categories p
join (values
  ('Base Salary', 'Monthly Salary', '💰', 1),
  ('Bonus / Holiday Bonus', 'Holiday Bonus (THR)', '🎁', 1),
  ('Bonus / Holiday Bonus', 'Performance Bonus', '🏆', 2),
  ('Side Business', 'Projects', '💼', 1),
  ('Other Income', 'Transfer / Gift', '➕', 1),
  ('Savings', 'Emergency Fund', '🛟', 1),
  ('Savings', 'Investment', '📈', 2),
  ('Housing', 'Mortgage', '🏦', 1),
  ('Housing', 'Renovation', '🔨', 2),
  ('Housing', 'Maintenance', '🔧', 3),
  ('Transportation', 'E-Money', '💳', 1),
  ('Transportation', 'Car Fuel', '⛽', 2),
  ('Transportation', 'Motorcycle Fuel', '🛵', 3),
  ('Transportation', 'Cash Parking', '🅿️', 4),
  ('Transportation', 'Car Wash', '🚿', 5),
  ('Transportation', 'Motorcycle Wash', '🧼', 6),
  ('Transportation', 'Car Service', '🛠️', 7),
  ('Transportation', 'Motorcycle Service', '🔩', 8),
  ('Transportation', 'Car Tax', '📄', 9),
  ('Transportation', 'Motorcycle Tax', '📋', 10),
  ('Transportation', 'Public Transit', '🚌', 11),
  ('Installments / Debt', 'Coway Water Filter', '💧', 1),
  ('Installments / Debt', 'Phone', '📱', 2),
  ('Installments / Debt', 'Other', '💳', 9),
  ('Lifestyle', 'Entertainment', '🎬', 1),
  ('Lifestyle', 'Gaming', '🎮', 2),
  ('Lifestyle', 'Hobbies', '🎨', 3),
  ('Clothing', 'Tops', '👔', 1),
  ('Clothing', 'Bottoms', '👖', 2),
  ('Clothing', 'Underwear', '🩲', 3),
  ('Clothing', 'Footwear', '👟', 4),
  ('Clothing', 'Bags', '👜', 5),
  ('Clothing', 'Accessories', '💍', 6),
  ('Clothing', 'Laundry', '🧺', 7),
  ('Phone', 'Phone Credit', '📞', 1),
  ('Phone', 'Internet', '📶', 2),
  ('Phone', 'Roaming', '🌏', 3),
  ('Phone', 'Accessories', '🎧', 4),
  ('Home Goods', 'Kitchen', '🍳', 1),
  ('Home Goods', 'Bedroom', '🛏️', 2),
  ('Home Goods', 'Bathroom', '🛁', 3),
  ('Home Goods', 'Dining Room', '🍽️', 4),
  ('Home Goods', 'Patio', '🪴', 5),
  ('Pets', 'Food', '🦴', 1),
  ('Pets', 'Toys', '🎾', 2),
  ('Pets', 'Accessories', '🦮', 3),
  ('Health', 'Haircut', '💇', 1),
  ('Health', 'Massage', '💆', 2),
  ('Health', 'Personal Care', '💅', 3),
  ('Health', 'Medicine', '💊', 4),
  ('Health', 'Intimate', '🔒', 5),
  ('Gifts', 'Condolence Gift', '🙏', 1),
  ('Gifts', 'Monthly Allowance Mom H', '👩', 2),
  ('Gifts', 'Monthly Allowance Mom D', '👵', 3),
  ('Gifts', 'Gift Family H', '🎀', 4),
  ('Gifts', 'Gift Family D', '🎀', 5),
  ('Gifts', 'Gift Friends H', '🤝', 6),
  ('Gifts', 'Gift Friends D', '🤝', 7),
  ('Gifts', 'Tips', '💵', 8),
  ('Family HD', 'Meals', '🍜', 1),
  ('Family HD', 'Snacks', '🍪', 2),
  ('Family HD', 'Entertainment', '🎢', 3),
  ('Family HD', 'Vacation', '✈️', 4),
  ('Family HD', 'Sports', '🏃', 5),
  ('Family H', 'Meals', '🍜', 1),
  ('Family H', 'Snacks', '🍪', 2),
  ('Family H', 'Entertainment', '🎢', 3),
  ('Family H', 'Vacation', '✈️', 4),
  ('Family H', 'Sports', '🏃', 5),
  ('Family D', 'Meals', '🍜', 1),
  ('Family D', 'Snacks', '🍪', 2),
  ('Family D', 'Entertainment', '🎢', 3),
  ('Family D', 'Vacation', '✈️', 4),
  ('Family D', 'Sports', '🏃', 5),
  ('Personal Growth', 'Research', '🔍', 1),
  ('Personal Growth', 'Books', '📖', 2),
  ('Personal Growth', 'Courses', '🎓', 3),
  ('Friends', 'Meals', '🍜', 1),
  ('Friends', 'Snacks', '🍪', 2),
  ('Friends', 'Entertainment', '🎢', 3),
  ('Friends', 'Vacation', '✈️', 4),
  ('Friends', 'Sports', '🏃', 5)
) as v(parent_name, name, icon, sort_order)
  on p.name = v.parent_name and p.parent_id is null
where not exists (
  select 1 from categories c
  where c.parent_id = p.id and c.name = v.name
);
