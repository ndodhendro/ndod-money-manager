/**
 * Rebuild expense categories + truncate test transactions via PostgREST.
 * Usage: node scripts/rebuild-categories.mjs
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
  { name: 'Gaji Pokok', type: 'income', budget_group: null, icon: '💰', sort_order: 1 },
  { name: 'Bonus / THR', type: 'income', budget_group: null, icon: '🎁', sort_order: 2 },
  { name: 'Usaha Sampingan', type: 'income', budget_group: null, icon: '🧾', sort_order: 3 },
  { name: 'Pemasukan Lainnya', type: 'income', budget_group: null, icon: '➕', sort_order: 4 },
  { name: 'Kebutuhan Pokok', type: 'expense', budget_group: 'needs', icon: '🛒', sort_order: 10 },
  { name: 'Tempat Tinggal', type: 'expense', budget_group: 'needs', icon: '🏠', sort_order: 11 },
  { name: 'Transportasi', type: 'expense', budget_group: 'needs', icon: '🚗', sort_order: 12 },
  { name: 'Cicilan / Utang', type: 'expense', budget_group: 'needs', icon: '💳', sort_order: 13 },
  { name: 'Gaya Hidup', type: 'expense', budget_group: 'wants', icon: '✨', sort_order: 14 },
  { name: 'Pakaian', type: 'expense', budget_group: 'wants', icon: '👕', sort_order: 15 },
  { name: 'HP', type: 'expense', budget_group: 'wants', icon: '📱', sort_order: 16 },
  { name: 'Barang Rumah', type: 'expense', budget_group: 'wants', icon: '🛋️', sort_order: 17 },
  { name: 'Peliharaan', type: 'expense', budget_group: 'wants', icon: '🐾', sort_order: 18 },
  { name: 'Kesehatan', type: 'expense', budget_group: 'needs', icon: '🏥', sort_order: 19 },
  { name: 'Kado', type: 'expense', budget_group: 'needs', icon: '🎁', sort_order: 20 },
  { name: 'Keluarga HD', type: 'expense', budget_group: 'wants', icon: '👨‍👩‍👧', sort_order: 21 },
  { name: 'Keluarga H', type: 'expense', budget_group: 'wants', icon: '👨', sort_order: 22 },
  { name: 'Keluarga D', type: 'expense', budget_group: 'wants', icon: '👩', sort_order: 23 },
  { name: 'Pengembangan', type: 'expense', budget_group: 'wants', icon: '📚', sort_order: 24 },
  { name: 'Teman', type: 'expense', budget_group: 'wants', icon: '👥', sort_order: 25 },
  { name: 'Lainnya', type: 'expense', budget_group: 'wants', icon: '📦', sort_order: 26 },
]

const CHILDREN = [
  ['Gaji Pokok', 'Gaji Bulanan', '💰', 1],
  ['Bonus / THR', 'THR', '🎁', 1],
  ['Bonus / THR', 'Bonus Kinerja', '🏆', 2],
  ['Usaha Sampingan', 'Proyek', '💼', 1],
  ['Pemasukan Lainnya', 'Transfer / Hadiah', '➕', 1],
  ['Tempat Tinggal', 'KPR', '🏦', 1],
  ['Tempat Tinggal', 'Renovasi', '🔨', 2],
  ['Tempat Tinggal', 'Perawatan', '🔧', 3],
  ['Transportasi', 'E-Money', '💳', 1],
  ['Transportasi', 'Bensin Mobil', '⛽', 2],
  ['Transportasi', 'Bensin Motor', '🛵', 3],
  ['Transportasi', 'Parkir Cash', '🅿️', 4],
  ['Transportasi', 'Cuci Mobil', '🚿', 5],
  ['Transportasi', 'Cuci Motor', '🧼', 6],
  ['Transportasi', 'Service Mobil', '🛠️', 7],
  ['Transportasi', 'Service Motor', '🔩', 8],
  ['Transportasi', 'Pajak Mobil', '📄', 9],
  ['Transportasi', 'Pajak Motor', '📋', 10],
  ['Transportasi', 'Transportasi Umum', '🚌', 11],
  ['Cicilan / Utang', 'Filter Air Coway', '💧', 1],
  ['Cicilan / Utang', 'HP', '📱', 2],
  ['Cicilan / Utang', 'Lainnya', '💳', 9],
  ['Gaya Hidup', 'Hiburan', '🎬', 1],
  ['Gaya Hidup', 'Gaming', '🎮', 2],
  ['Gaya Hidup', 'Hobi', '🎨', 3],
  ['Pakaian', 'Baju', '👔', 1],
  ['Pakaian', 'Celana', '👖', 2],
  ['Pakaian', 'Pakaian Dalam', '🩲', 3],
  ['Pakaian', 'Alas Kaki', '👟', 4],
  ['Pakaian', 'Tas', '👜', 5],
  ['Pakaian', 'Aksesoris', '💍', 6],
  ['Pakaian', 'Laundry', '🧺', 7],
  ['HP', 'Pulsa', '📞', 1],
  ['HP', 'Internet', '📶', 2],
  ['HP', 'Roaming', '🌏', 3],
  ['HP', 'Aksesoris', '🎧', 4],
  ['Barang Rumah', 'Dapur', '🍳', 1],
  ['Barang Rumah', 'Kamar Tidur', '🛏️', 2],
  ['Barang Rumah', 'Kamar Mandi', '🛁', 3],
  ['Barang Rumah', 'Ruang Makan', '🍽️', 4],
  ['Barang Rumah', 'Teras', '🪴', 5],
  ['Peliharaan', 'Makanan', '🦴', 1],
  ['Peliharaan', 'Mainan', '🎾', 2],
  ['Peliharaan', 'Aksesoris', '🦮', 3],
  ['Kesehatan', 'Potong Rambut', '💇', 1],
  ['Kesehatan', 'Pijat', '💆', 2],
  ['Kesehatan', 'Perawatan', '💅', 3],
  ['Kesehatan', 'Obat', '💊', 4],
  ['Kesehatan', 'Seksual', '🔒', 5],
  ['Kado', 'Dana Paramita', '🙏', 1],
  ['Kado', 'Bulanan Mama H', '👩', 2],
  ['Kado', 'Bulanan Mama D', '👵', 3],
  ['Kado', 'Kado Keluarga H', '🎀', 4],
  ['Kado', 'Kado Keluarga D', '🎀', 5],
  ['Kado', 'Kado Teman H', '🤝', 6],
  ['Kado', 'Kado Teman D', '🤝', 7],
  ['Kado', 'Tips', '💵', 8],
  ['Keluarga HD', 'Makan', '🍜', 1],
  ['Keluarga HD', 'Jajan', '🍪', 2],
  ['Keluarga HD', 'Hiburan', '🎢', 3],
  ['Keluarga HD', 'Liburan', '✈️', 4],
  ['Keluarga HD', 'Olahraga', '🏃', 5],
  ['Keluarga H', 'Makan', '🍜', 1],
  ['Keluarga H', 'Jajan', '🍪', 2],
  ['Keluarga H', 'Hiburan', '🎢', 3],
  ['Keluarga H', 'Liburan', '✈️', 4],
  ['Keluarga H', 'Olahraga', '🏃', 5],
  ['Keluarga D', 'Makan', '🍜', 1],
  ['Keluarga D', 'Jajan', '🍪', 2],
  ['Keluarga D', 'Hiburan', '🎢', 3],
  ['Keluarga D', 'Liburan', '✈️', 4],
  ['Keluarga D', 'Olahraga', '🏃', 5],
  ['Pengembangan', 'Riset', '🔍', 1],
  ['Pengembangan', 'Buku', '📖', 2],
  ['Pengembangan', 'Kursus', '🎓', 3],
  ['Teman', 'Makan', '🍜', 1],
  ['Teman', 'Jajan', '🍪', 2],
  ['Teman', 'Hiburan', '🎢', 3],
  ['Teman', 'Liburan', '✈️', 4],
  ['Teman', 'Olahraga', '🏃', 5],
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

  const cats = await api('GET', '/categories?select=id,name,parent_id,icon&order=sort_order.asc')
  const txs = await api('GET', '/transactions?select=id')
  const rootsN = cats.filter((c) => !c.parent_id).length
  const kidsN = cats.filter((c) => c.parent_id).length
  console.log(`Done. categories=${cats.length} (roots=${rootsN}, children=${kidsN}), transactions=${txs.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
