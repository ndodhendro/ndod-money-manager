/**
 * Rebuild expense categories + truncate test transactions via PostgREST.
 * Usage: node scripts/rebuild-categories.mjs
 *
 * WARNING: Deletes ALL transactions, then recreates categories (English names).
 * Prefer scripts/rename-categories-en.mjs to keep existing transaction FKs.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnv()
const base = `${env.VITE_SUPABASE_URL?.replace(/\/$/, '')}/rest/v1`
const key = env.VITE_SUPABASE_ANON_KEY
if (!env.VITE_SUPABASE_URL || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return data
}

const ROOTS = [
  { name: 'Base Salary', type: 'income', budget_group: null, icon: '💰', sort_order: 1 },
  { name: 'Bonus / Holiday Bonus', type: 'income', budget_group: null, icon: '🎁', sort_order: 2 },
  { name: 'Side Business', type: 'income', budget_group: null, icon: '🧾', sort_order: 3 },
  { name: 'Other Income', type: 'income', budget_group: null, icon: '➕', sort_order: 4 },
  { name: 'Savings', type: 'expense', budget_group: 'savings', icon: '🏦', sort_order: 9 },
  { name: 'Essentials', type: 'expense', budget_group: 'needs', icon: '🛒', sort_order: 10 },
  { name: 'Housing', type: 'expense', budget_group: 'needs', icon: '🏠', sort_order: 11 },
  { name: 'Transportation', type: 'expense', budget_group: 'needs', icon: '🚗', sort_order: 12 },
  { name: 'Installments / Debt', type: 'expense', budget_group: 'needs', icon: '💳', sort_order: 13 },
  { name: 'Lifestyle', type: 'expense', budget_group: 'wants', icon: '✨', sort_order: 14 },
  { name: 'Clothing', type: 'expense', budget_group: 'wants', icon: '👕', sort_order: 15 },
  { name: 'Phone', type: 'expense', budget_group: 'wants', icon: '📱', sort_order: 16 },
  { name: 'Home Goods', type: 'expense', budget_group: 'wants', icon: '🛋️', sort_order: 17 },
  { name: 'Pets', type: 'expense', budget_group: 'wants', icon: '🐾', sort_order: 18 },
  { name: 'Health', type: 'expense', budget_group: 'needs', icon: '🏥', sort_order: 19 },
  { name: 'Gifts', type: 'expense', budget_group: 'needs', icon: '🎁', sort_order: 20 },
  { name: 'Family HD', type: 'expense', budget_group: 'wants', icon: '👨‍👩‍👧', sort_order: 21 },
  { name: 'Family H', type: 'expense', budget_group: 'wants', icon: '👨', sort_order: 22 },
  { name: 'Family D', type: 'expense', budget_group: 'wants', icon: '👩', sort_order: 23 },
  { name: 'Personal Growth', type: 'expense', budget_group: 'wants', icon: '📚', sort_order: 24 },
  { name: 'Friends', type: 'expense', budget_group: 'wants', icon: '👥', sort_order: 25 },
  { name: 'Other', type: 'expense', budget_group: 'wants', icon: '📦', sort_order: 26 },
]

const CHILDREN = [
  ['Base Salary', 'Monthly Salary', '💰', 1],
  ['Bonus / Holiday Bonus', 'Holiday Bonus (THR)', '🎁', 1],
  ['Bonus / Holiday Bonus', 'Performance Bonus', '🏆', 2],
  ['Side Business', 'Projects', '💼', 1],
  ['Other Income', 'Transfer / Gift', '➕', 1],
  ['Savings', 'Emergency Fund', '🛟', 1],
  ['Savings', 'Investment', '📈', 2],
  ['Housing', 'Mortgage', '🏦', 1],
  ['Housing', 'Renovation', '🔨', 2],
  ['Housing', 'Maintenance', '🔧', 3],
  ['Transportation', 'E-Money', '💳', 1],
  ['Transportation', 'Car Fuel', '⛽', 2],
  ['Transportation', 'Motorcycle Fuel', '🛵', 3],
  ['Transportation', 'Cash Parking', '🅿️', 4],
  ['Transportation', 'Car Wash', '🚿', 5],
  ['Transportation', 'Motorcycle Wash', '🧼', 6],
  ['Transportation', 'Car Service', '🛠️', 7],
  ['Transportation', 'Motorcycle Service', '🔩', 8],
  ['Transportation', 'Car Tax', '📄', 9],
  ['Transportation', 'Motorcycle Tax', '📋', 10],
  ['Transportation', 'Public Transit', '🚌', 11],
  ['Installments / Debt', 'Coway Water Filter', '💧', 1],
  ['Installments / Debt', 'Phone', '📱', 2],
  ['Installments / Debt', 'Other', '💳', 9],
  ['Lifestyle', 'Entertainment', '🎬', 1],
  ['Lifestyle', 'Gaming', '🎮', 2],
  ['Lifestyle', 'Hobbies', '🎨', 3],
  ['Clothing', 'Tops', '👔', 1],
  ['Clothing', 'Bottoms', '👖', 2],
  ['Clothing', 'Underwear', '🩲', 3],
  ['Clothing', 'Footwear', '👟', 4],
  ['Clothing', 'Bags', '👜', 5],
  ['Clothing', 'Accessories', '💍', 6],
  ['Clothing', 'Laundry', '🧺', 7],
  ['Phone', 'Phone Credit', '📞', 1],
  ['Phone', 'Internet', '📶', 2],
  ['Phone', 'Roaming', '🌏', 3],
  ['Phone', 'Accessories', '🎧', 4],
  ['Home Goods', 'Kitchen', '🍳', 1],
  ['Home Goods', 'Bedroom', '🛏️', 2],
  ['Home Goods', 'Bathroom', '🛁', 3],
  ['Home Goods', 'Dining Room', '🍽️', 4],
  ['Home Goods', 'Patio', '🪴', 5],
  ['Pets', 'Food', '🦴', 1],
  ['Pets', 'Toys', '🎾', 2],
  ['Pets', 'Accessories', '🦮', 3],
  ['Health', 'Haircut', '💇', 1],
  ['Health', 'Massage', '💆', 2],
  ['Health', 'Personal Care', '💅', 3],
  ['Health', 'Medicine', '💊', 4],
  ['Health', 'Intimate', '🔒', 5],
  ['Gifts', 'Condolence Gift', '🙏', 1],
  ['Gifts', 'Monthly Allowance Mom H', '👩', 2],
  ['Gifts', 'Monthly Allowance Mom D', '👵', 3],
  ['Gifts', 'Gift Family H', '🎀', 4],
  ['Gifts', 'Gift Family D', '🎀', 5],
  ['Gifts', 'Gift Friends H', '🤝', 6],
  ['Gifts', 'Gift Friends D', '🤝', 7],
  ['Gifts', 'Tips', '💵', 8],
  ['Family HD', 'Meals', '🍜', 1],
  ['Family HD', 'Snacks', '🍪', 2],
  ['Family HD', 'Entertainment', '🎢', 3],
  ['Family HD', 'Vacation', '✈️', 4],
  ['Family HD', 'Sports', '🏃', 5],
  ['Family H', 'Meals', '🍜', 1],
  ['Family H', 'Snacks', '🍪', 2],
  ['Family H', 'Entertainment', '🎢', 3],
  ['Family H', 'Vacation', '✈️', 4],
  ['Family H', 'Sports', '🏃', 5],
  ['Family D', 'Meals', '🍜', 1],
  ['Family D', 'Snacks', '🍪', 2],
  ['Family D', 'Entertainment', '🎢', 3],
  ['Family D', 'Vacation', '✈️', 4],
  ['Family D', 'Sports', '🏃', 5],
  ['Personal Growth', 'Research', '🔍', 1],
  ['Personal Growth', 'Books', '📖', 2],
  ['Personal Growth', 'Courses', '🎓', 3],
  ['Friends', 'Meals', '🍜', 1],
  ['Friends', 'Snacks', '🍪', 2],
  ['Friends', 'Entertainment', '🎢', 3],
  ['Friends', 'Vacation', '✈️', 4],
  ['Friends', 'Sports', '🏃', 5],
]

async function main() {
  console.log('1) Truncate transactions…')
  await api(
    'DELETE',
    '/transactions?id=neq.00000000-0000-0000-0000-000000000000',
  )

  console.log('2) Delete categories…')
  await api(
    'DELETE',
    '/categories?id=neq.00000000-0000-0000-0000-000000000000',
  )

  console.log('3) Insert roots…')
  const roots = await api('POST', '/categories', ROOTS)
  const byName = new Map(roots.map((r) => [r.name, r]))

  console.log('4) Insert children…')
  const childRows = CHILDREN.map(([parentName, name, icon, sort_order]) => {
    const parent = byName.get(parentName)
    if (!parent) throw new Error(`Missing parent: ${parentName}`)
    return {
      name,
      type: parent.type,
      budget_group: parent.budget_group,
      icon,
      sort_order,
      parent_id: parent.id,
      is_active: true,
    }
  })

  for (let i = 0; i < childRows.length; i += 40) {
    const chunk = childRows.slice(i, i + 40)
    await api('POST', '/categories', chunk)
  }

  const cats = await api(
    'GET',
    '/categories?select=id,name,parent_id,icon&order=sort_order.asc',
  )
  const txs = await api('GET', '/transactions?select=id')
  const rootsN = cats.filter((c) => !c.parent_id).length
  const kidsN = cats.filter((c) => c.parent_id).length
  console.log(
    `Done. categories=${cats.length} (roots=${rootsN}, children=${kidsN}), transactions=${txs.length}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
