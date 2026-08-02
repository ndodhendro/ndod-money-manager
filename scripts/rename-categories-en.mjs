/**
 * Rename ALL remaining Indonesian category names → English (in place).
 * Covers seed tree + live-DB divergences (Rumah, Cicilan, Keluarga Besar, …).
 * Usage: node scripts/rename-categories-en.mjs
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

/** Any root name (ID or already EN) → English */
const ROOT_MAP = {
  'Gaji Pokok': 'Base Salary',
  'Bonus / THR': 'Bonus / Holiday Bonus',
  'Usaha Sampingan': 'Side Business',
  'Pemasukan Lainnya': 'Other Income',
  'Kebutuhan Pokok': 'Essentials',
  'Tempat Tinggal': 'Housing',
  Rumah: 'Housing',
  Transportasi: 'Transportation',
  'Cicilan / Utang': 'Installments / Debt',
  Cicilan: 'Installments',
  'Gaya Hidup': 'Lifestyle',
  Pakaian: 'Clothing',
  HP: 'Phone',
  'Barang Rumah': 'Home Goods',
  Peliharaan: 'Pets',
  Kesehatan: 'Health',
  Kado: 'Gifts',
  'Keluarga HD': 'Family HD',
  'Keluarga H': 'Family H',
  'Keluarga D': 'Family D',
  'Keluarga Besar': 'Extended Family',
  Pengembangan: 'Personal Growth',
  Teman: 'Friends',
  Lainnya: 'Other',
}

/**
 * Child renames keyed by `${parentCurrentName}|${childCurrentName}`.
 * Includes both Indonesian parents and already-renamed English parents
 * so a second pass still catches leftovers.
 */
const CHILD_ENTRIES = [
  // Seed / classic
  ['Gaji Pokok', 'Gaji Bulanan', 'Monthly Salary'],
  ['Base Salary', 'Gaji Bulanan', 'Monthly Salary'],
  ['Bonus / THR', 'THR', 'Holiday Bonus (THR)'],
  ['Bonus / THR', 'Bonus Kinerja', 'Performance Bonus'],
  ['Bonus / Holiday Bonus', 'THR', 'Holiday Bonus (THR)'],
  ['Bonus / Holiday Bonus', 'Bonus Kinerja', 'Performance Bonus'],
  ['Usaha Sampingan', 'Proyek', 'Projects'],
  ['Side Business', 'Proyek', 'Projects'],
  ['Pemasukan Lainnya', 'Transfer / Hadiah', 'Transfer / Gift'],
  ['Other Income', 'Transfer / Hadiah', 'Transfer / Gift'],
  ['Tempat Tinggal', 'KPR', 'Mortgage'],
  ['Tempat Tinggal', 'Renovasi', 'Renovation'],
  ['Tempat Tinggal', 'Perawatan', 'Maintenance'],
  ['Rumah', 'KPR', 'Mortgage'],
  ['Rumah', 'Renovasi', 'Renovation'],
  ['Rumah', 'Perawatan', 'Maintenance'],
  ['Rumah', 'Logistik', 'Logistics'],
  ['Rumah', 'Utilitas', 'Utilities'],
  ['Housing', 'KPR', 'Mortgage'],
  ['Housing', 'Renovasi', 'Renovation'],
  ['Housing', 'Perawatan', 'Maintenance'],
  ['Housing', 'Logistik', 'Logistics'],
  ['Housing', 'Utilitas', 'Utilities'],
  ['Transportasi', 'E-Money', 'E-Money'],
  ['Transportasi', 'Bensin Mobil', 'Car Fuel'],
  ['Transportasi', 'Bensin Motor', 'Motorcycle Fuel'],
  ['Transportasi', 'Parkir Cash', 'Cash Parking'],
  ['Transportasi', 'Cuci Mobil', 'Car Wash'],
  ['Transportasi', 'Cuci Motor', 'Motorcycle Wash'],
  ['Transportasi', 'Service Mobil', 'Car Service'],
  ['Transportasi', 'Service Motor', 'Motorcycle Service'],
  ['Transportasi', 'Pajak Mobil', 'Car Tax'],
  ['Transportasi', 'Pajak Motor', 'Motorcycle Tax'],
  ['Transportasi', 'Transportasi Umum', 'Public Transit'],
  ['Transportation', 'Bensin Mobil', 'Car Fuel'],
  ['Transportation', 'Bensin Motor', 'Motorcycle Fuel'],
  ['Transportation', 'Parkir Cash', 'Cash Parking'],
  ['Transportation', 'Cuci Mobil', 'Car Wash'],
  ['Transportation', 'Cuci Motor', 'Motorcycle Wash'],
  ['Transportation', 'Service Mobil', 'Car Service'],
  ['Transportation', 'Service Motor', 'Motorcycle Service'],
  ['Transportation', 'Pajak Mobil', 'Car Tax'],
  ['Transportation', 'Pajak Motor', 'Motorcycle Tax'],
  ['Transportation', 'Transportasi Umum', 'Public Transit'],
  ['Cicilan / Utang', 'Filter Air Coway', 'Coway Water Filter'],
  ['Cicilan / Utang', 'HP', 'Phone'],
  ['Cicilan / Utang', 'Lainnya', 'Other'],
  ['Cicilan', 'Filter Air Coway', 'Coway Water Filter'],
  ['Cicilan', 'HP', 'Phone'],
  ['Cicilan', 'Lainnya', 'Other'],
  ['Installments', 'Filter Air Coway', 'Coway Water Filter'],
  ['Installments', 'HP', 'Phone'],
  ['Installments', 'Lainnya', 'Other'],
  ['Installments / Debt', 'Filter Air Coway', 'Coway Water Filter'],
  ['Installments / Debt', 'HP', 'Phone'],
  ['Installments / Debt', 'Lainnya', 'Other'],
  ['Gaya Hidup', 'Hiburan', 'Entertainment'],
  ['Gaya Hidup', 'Gaming', 'Gaming'],
  ['Gaya Hidup', 'Hobi', 'Hobbies'],
  ['Lifestyle', 'Hiburan', 'Entertainment'],
  ['Lifestyle', 'Hobi', 'Hobbies'],
  ['Pakaian', 'Baju', 'Tops'],
  ['Pakaian', 'Celana', 'Bottoms'],
  ['Pakaian', 'Pakaian Dalam', 'Underwear'],
  ['Pakaian', 'Alas Kaki', 'Footwear'],
  ['Pakaian', 'Tas', 'Bags'],
  ['Pakaian', 'Aksesoris', 'Accessories'],
  ['Pakaian', 'Laundry', 'Laundry'],
  ['Clothing', 'Baju', 'Tops'],
  ['Clothing', 'Celana', 'Bottoms'],
  ['Clothing', 'Pakaian Dalam', 'Underwear'],
  ['Clothing', 'Alas Kaki', 'Footwear'],
  ['Clothing', 'Tas', 'Bags'],
  ['Clothing', 'Aksesoris', 'Accessories'],
  ['HP', 'Pulsa', 'Phone Credit'],
  ['HP', 'Internet', 'Internet'],
  ['HP', 'Roaming', 'Roaming'],
  ['HP', 'Aksesoris', 'Accessories'],
  ['Phone', 'Pulsa', 'Phone Credit'],
  ['Phone', 'Aksesoris', 'Accessories'],
  ['Barang Rumah', 'Dapur', 'Kitchen'],
  ['Barang Rumah', 'Kamar Tidur', 'Bedroom'],
  ['Barang Rumah', 'Kamar Mandi', 'Bathroom'],
  ['Barang Rumah', 'Ruang Makan', 'Dining Room'],
  ['Barang Rumah', 'Teras', 'Patio'],
  ['Home Goods', 'Dapur', 'Kitchen'],
  ['Home Goods', 'Kamar Tidur', 'Bedroom'],
  ['Home Goods', 'Kamar Mandi', 'Bathroom'],
  ['Home Goods', 'Ruang Makan', 'Dining Room'],
  ['Home Goods', 'Teras', 'Patio'],
  ['Peliharaan', 'Makanan', 'Food'],
  ['Peliharaan', 'Mainan', 'Toys'],
  ['Peliharaan', 'Aksesoris', 'Accessories'],
  ['Pets', 'Makanan', 'Food'],
  ['Pets', 'Mainan', 'Toys'],
  ['Pets', 'Aksesoris', 'Accessories'],
  ['Kesehatan', 'Potong Rambut', 'Haircut'],
  ['Kesehatan', 'Pijat', 'Massage'],
  ['Kesehatan', 'Perawatan', 'Personal Care'],
  ['Kesehatan', 'Obat', 'Medicine'],
  ['Kesehatan', 'Seksual', 'Intimate'],
  ['Kesehatan', 'Asuransi', 'Insurance'],
  ['Health', 'Potong Rambut', 'Haircut'],
  ['Health', 'Pijat', 'Massage'],
  ['Health', 'Perawatan', 'Personal Care'],
  ['Health', 'Obat', 'Medicine'],
  ['Health', 'Seksual', 'Intimate'],
  ['Health', 'Asuransi', 'Insurance'],
  ['Kado', 'Dana Paramita', 'Condolence Gift'],
  ['Kado', 'Bulanan Mama H', 'Monthly Allowance Mom H'],
  ['Kado', 'Bulanan Mama D', 'Monthly Allowance Mom D'],
  ['Kado', 'Bulanan Ortu', 'Monthly Parents Allowance'],
  ['Kado', 'Kado Keluarga H', 'Gift Family H'],
  ['Kado', 'Kado Keluarga D', 'Gift Family D'],
  ['Kado', 'Kado Keluarga', 'Family Gift'],
  ['Kado', 'Kado Teman H', 'Gift Friends H'],
  ['Kado', 'Kado Teman D', 'Gift Friends D'],
  ['Kado', 'Kado Teman', 'Friends Gift'],
  ['Kado', 'Tips', 'Tips'],
  ['Gifts', 'Dana Paramita', 'Condolence Gift'],
  ['Gifts', 'Bulanan Mama H', 'Monthly Allowance Mom H'],
  ['Gifts', 'Bulanan Mama D', 'Monthly Allowance Mom D'],
  ['Gifts', 'Bulanan Ortu', 'Monthly Parents Allowance'],
  ['Gifts', 'Kado Keluarga H', 'Gift Family H'],
  ['Gifts', 'Kado Keluarga D', 'Gift Family D'],
  ['Gifts', 'Kado Keluarga', 'Family Gift'],
  ['Gifts', 'Kado Teman H', 'Gift Friends H'],
  ['Gifts', 'Kado Teman D', 'Gift Friends D'],
  ['Gifts', 'Kado Teman', 'Friends Gift'],
  ['Keluarga HD', 'Makan', 'Meals'],
  ['Keluarga HD', 'Jajan', 'Snacks'],
  ['Keluarga HD', 'Hiburan', 'Entertainment'],
  ['Keluarga HD', 'Liburan', 'Vacation'],
  ['Keluarga HD', 'Olahraga', 'Sports'],
  ['Keluarga HD', 'Kebutuhan Pokok', 'Essentials'],
  ['Keluarga HD', 'Pakaian', 'Clothing'],
  ['Family HD', 'Makan', 'Meals'],
  ['Family HD', 'Jajan', 'Snacks'],
  ['Family HD', 'Hiburan', 'Entertainment'],
  ['Family HD', 'Liburan', 'Vacation'],
  ['Family HD', 'Olahraga', 'Sports'],
  ['Family HD', 'Kebutuhan Pokok', 'Essentials'],
  ['Family HD', 'Pakaian', 'Clothing'],
  ['Keluarga H', 'Makan', 'Meals'],
  ['Keluarga H', 'Jajan', 'Snacks'],
  ['Keluarga H', 'Hiburan', 'Entertainment'],
  ['Keluarga H', 'Liburan', 'Vacation'],
  ['Keluarga H', 'Olahraga', 'Sports'],
  ['Family H', 'Makan', 'Meals'],
  ['Family H', 'Jajan', 'Snacks'],
  ['Family H', 'Hiburan', 'Entertainment'],
  ['Family H', 'Liburan', 'Vacation'],
  ['Family H', 'Olahraga', 'Sports'],
  ['Keluarga D', 'Makan', 'Meals'],
  ['Keluarga D', 'Jajan', 'Snacks'],
  ['Keluarga D', 'Hiburan', 'Entertainment'],
  ['Keluarga D', 'Liburan', 'Vacation'],
  ['Keluarga D', 'Olahraga', 'Sports'],
  ['Family D', 'Makan', 'Meals'],
  ['Family D', 'Jajan', 'Snacks'],
  ['Family D', 'Hiburan', 'Entertainment'],
  ['Family D', 'Liburan', 'Vacation'],
  ['Family D', 'Olahraga', 'Sports'],
  ['Keluarga Besar', 'Makan', 'Meals'],
  ['Keluarga Besar', 'Jajan', 'Snacks'],
  ['Keluarga Besar', 'Hiburan', 'Entertainment'],
  ['Keluarga Besar', 'Liburan', 'Vacation'],
  ['Keluarga Besar', 'Olahraga', 'Sports'],
  ['Keluarga Besar', 'Pakaian', 'Clothing'],
  ['Extended Family', 'Makan', 'Meals'],
  ['Extended Family', 'Jajan', 'Snacks'],
  ['Extended Family', 'Hiburan', 'Entertainment'],
  ['Extended Family', 'Liburan', 'Vacation'],
  ['Extended Family', 'Olahraga', 'Sports'],
  ['Extended Family', 'Pakaian', 'Clothing'],
  ['Pengembangan', 'Riset', 'Research'],
  ['Pengembangan', 'Buku', 'Books'],
  ['Pengembangan', 'Kursus', 'Courses'],
  ['Personal Growth', 'Riset', 'Research'],
  ['Personal Growth', 'Buku', 'Books'],
  ['Personal Growth', 'Kursus', 'Courses'],
  ['Teman', 'Makan', 'Meals'],
  ['Teman', 'Jajan', 'Snacks'],
  ['Teman', 'Hiburan', 'Entertainment'],
  ['Teman', 'Liburan', 'Vacation'],
  ['Teman', 'Olahraga', 'Sports'],
  ['Friends', 'Makan', 'Meals'],
  ['Friends', 'Jajan', 'Snacks'],
  ['Friends', 'Hiburan', 'Entertainment'],
  ['Friends', 'Liburan', 'Vacation'],
  ['Friends', 'Olahraga', 'Sports'],
]

const CHILD_MAP = Object.fromEntries(
  CHILD_ENTRIES.map(([p, c, en]) => [`${p}|${c}`, en]),
)

async function main() {
  const cats = await api(
    'GET',
    '/categories?select=id,name,parent_id&order=sort_order.asc',
  )
  const byId = new Map(cats.map((c) => [c.id, c]))
  let updated = 0

  for (const child of cats.filter((c) => c.parent_id)) {
    const parent = byId.get(child.parent_id)
    if (!parent) continue
    const key = `${parent.name}|${child.name}`
    const next = CHILD_MAP[key]
    if (!next || next === child.name) continue
    await api('PATCH', `/categories?id=eq.${child.id}`, { name: next })
    console.log(`  child: ${key} → ${next}`)
    updated++
    child.name = next
  }

  for (const root of cats.filter((c) => !c.parent_id)) {
    const next = ROOT_MAP[root.name]
    if (!next || next === root.name) continue
    await api('PATCH', `/categories?id=eq.${root.id}`, { name: next })
    console.log(`  root: ${root.name} → ${next}`)
    updated++
    root.name = next
  }

  console.log(`Done. updated=${updated}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
