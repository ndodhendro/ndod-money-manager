import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      const key = l.slice(0, i).trim()
      const val = l
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
      return [key, val]
    }),
)

const base = env.VITE_SUPABASE_URL.replace(/\/$/, '')
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
}

async function get(table, query) {
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, { headers })
  if (!res.ok) {
    throw new Error(`${table}: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

const buckets = await get(
  'buckets',
  'select=id,name,icon,kind,parent_id,category_id,is_active&kind=eq.sinking&is_active=eq.true&order=name',
)
const cats = await get(
  'categories',
  'select=id,name,icon,parent_id,is_active,type',
)

const byId = new Map(cats.map((c) => [c.id, c]))
const unmapped = []
const mappedDiff = []
const mappedOk = []

for (const b of buckets) {
  if (!b.category_id) {
    unmapped.push({
      id: b.id,
      bucket: b.name,
      icon: b.icon,
      parent_id: b.parent_id,
      reason: 'category_id null',
    })
    continue
  }
  const c = byId.get(b.category_id)
  if (!c) {
    unmapped.push({
      id: b.id,
      bucket: b.name,
      icon: b.icon,
      category_id: b.category_id,
      reason: 'category missing',
    })
    continue
  }
  const level = c.parent_id ? 'subcategory' : 'main_category'
  const row = {
    id: b.id,
    bucket: b.name,
    bucket_icon: b.icon,
    category: c.name,
    category_icon: c.icon,
    level,
  }
  if (b.name !== c.name || b.icon !== c.icon) mappedDiff.push(row)
  else mappedOk.push(row)
}

console.log(`=== UNMAPPED / BROKEN (${unmapped.length}) ===`)
console.log(JSON.stringify(unmapped, null, 2))
console.log(`=== MAPPED BUT NAME/ICON DIFFERS (${mappedDiff.length}) ===`)
console.log(JSON.stringify(mappedDiff, null, 2))
console.log(`=== MAPPED ALREADY IN SYNC (${mappedOk.length}) ===`)
console.log(
  JSON.stringify(
    mappedOk.map((r) => ({ bucket: r.bucket, level: r.level })),
    null,
    2,
  ),
)
