import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ]
    }),
)

const base = env.VITE_SUPABASE_URL.replace(/\/$/, '')
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
}

async function get(table, query) {
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, { headers })
  if (!res.ok) throw new Error(`${table}: ${await res.text()}`)
  return res.json()
}

const buckets = await get(
  'buckets',
  'select=id,name,icon,parent_id,category_id,budget_group&kind=eq.sinking&is_active=eq.true&order=name',
)
const cats = await get(
  'categories',
  'select=id,name,icon,parent_id,budget_group,type,is_active&type=eq.expense&is_active=eq.true',
)

const parents = new Map(cats.filter((c) => !c.parent_id).map((c) => [c.id, c]))
const byNameUnderParent = new Map()
for (const c of cats) {
  if (!c.parent_id) continue
  const p = parents.get(c.parent_id)
  const key = `${(p?.name || '').toLowerCase()}::${c.name.toLowerCase()}`
  byNameUnderParent.set(key, c)
  byNameUnderParent.set(`::${c.name.toLowerCase()}`, c) // fallback by sub name only
}

/** bucket name -> { parentName, subName } */
const mapSpec = [
  // exact / prior fuzzy
  ['Haircut', 'Healths', 'Haircut'],
  ['Makeup', 'Healths', 'Makeup'],
  ['Religious Offerings', 'Gifts', 'Religious Offerings'],
  ['Skin Care', 'Healths', 'Skin Care'],
  ['Softlens', 'Healths', 'Softlens'],
  ['Car Lic Plate - Q Rizz', 'Legal Documents', 'Car Lic Plate'],
  ['Car Service - Q Rizz', 'Transportations', 'Car Service'],
  ['Car Tax - Q Rizz', 'Legal Documents', 'Car Tax'],
  ['Cash Parking - Q Rizz', 'Transportations', 'Cash Parking'],
  ['Motorcycle Lic Plate - Vario', 'Legal Documents', 'Motorcycle Lic Plate'],
  ['Motorcycle Service - Vario', 'Transportations', 'Motorcycle Service'],
  ['Motorcycle Tax - Vario', 'Legal Documents', 'Motorcycle Tax'],
  ['Passport - HD', 'Legal Documents', 'Passport'],
  ['SIM A - H', 'Legal Documents', 'SIM A'],
  // newly added by user
  ['AC Service', 'Housing', 'AC Maintenance'],
  ['Birthday Gifts', 'Gifts', 'Family Gift'],
  ["Imlek's Angpao", 'Gifts', "Imlek's Angpao"],
  ["Imlek's Clothes", 'Lifestyle', "Imlek's Clothes"],
  ["Parents' Imlek Clothes", 'Gifts', "Parents' Imlek Clothes"],
  ['Youtube Premium - H', 'Lifestyle', 'Subscription'],
]

const resolved = []
const missing = []
for (const [bucketName, parentName, subName] of mapSpec) {
  const bucket = buckets.find((b) => b.name === bucketName)
  if (!bucket) {
    missing.push({ bucketName, reason: 'bucket not found' })
    continue
  }
  const key = `${parentName.toLowerCase()}::${subName.toLowerCase()}`
  let cat = byNameUnderParent.get(key)
  if (!cat) {
    // try soft match parent
    const parent = [...parents.values()].find(
      (p) => p.name.toLowerCase() === parentName.toLowerCase(),
    )
    if (parent) {
      cat = cats.find(
        (c) =>
          c.parent_id === parent.id &&
          c.name.toLowerCase() === subName.toLowerCase(),
      )
    }
  }
  if (!cat) {
    // fuzzy sub name only
    cat = cats.find(
      (c) => c.parent_id && c.name.toLowerCase() === subName.toLowerCase(),
    )
  }
  if (!cat) {
    missing.push({ bucketName, parentName, subName, reason: 'category not found' })
    continue
  }
  const parentCat = parents.get(cat.parent_id)
  resolved.push({
    bucket,
    cat,
    parentCat,
  })
}

console.log('RESOLVED', resolved.length)
console.log(JSON.stringify(resolved.map((r) => ({
  bucket: r.bucket.name,
  sub: r.cat.name,
  parent: r.parentCat?.name,
  bucket_id: r.bucket.id,
  category_id: r.cat.id,
  parent_category_id: r.cat.parent_id,
})), null, 2))
console.log('MISSING', JSON.stringify(missing, null, 2))

// Unique parent categories that need parent buckets
const parentCatsNeeded = new Map()
for (const r of resolved) {
  if (r.parentCat) parentCatsNeeded.set(r.parentCat.id, r.parentCat)
}

const existingParentBuckets = buckets.filter((b) => b.category_id)
// Also fetch all buckets including those that might already be parents
const allBuckets = await get(
  'buckets',
  'select=id,name,icon,parent_id,category_id,budget_group,kind,is_active&kind=eq.sinking',
)

const parentBucketByCat = new Map()
for (const b of allBuckets) {
  if (b.category_id && b.is_active) parentBucketByCat.set(b.category_id, b)
}

let sql = `-- Map legacy sinking funds → expense subcategories.
-- Also ensures parent-category bank-mirror buckets and sets parent_id.
-- Review, then run in Supabase SQL Editor (one transaction).

begin;

-- ---------------------------------------------------------------------------
-- A) Ensure parent (bank-mirror) sinking buckets for parent categories
-- ---------------------------------------------------------------------------
`

for (const parentCat of parentCatsNeeded.values()) {
  const existing = allBuckets.find(
    (b) => b.is_active && b.category_id === parentCat.id && !b.parent_id,
  )
  const group =
    parentCat.budget_group === 'wants' || parentCat.budget_group === 'needs'
      ? parentCat.budget_group
      : 'needs'
  if (existing) {
    sql += `
-- Parent already exists for ${parentCat.name}: ${existing.id}
`
    continue
  }
  sql += `
insert into buckets (name, kind, icon, target_amount, opening_balance, budget_group, parent_id, category_id, sort_order, is_system, is_active)
select
  ${literal(parentCat.name)},
  'sinking',
  ${literal(parentCat.icon || '🎯')},
  null,
  0,
  '${group}'::budget_group,
  null,
  '${parentCat.id}'::uuid,
  0,
  false,
  true
where not exists (
  select 1 from buckets b
  where b.category_id = '${parentCat.id}'::uuid
    and b.is_active = true
    and b.kind = 'sinking'
);
`
}

sql += `
-- ---------------------------------------------------------------------------
-- B) Map leaf sinking funds to subcategories + sync name/icon + parent_id
-- ---------------------------------------------------------------------------
`

for (const r of resolved) {
  const group =
    r.cat.budget_group === 'wants' || r.cat.budget_group === 'needs'
      ? r.cat.budget_group
      : 'needs'
  sql += `
update buckets b
set
  category_id = '${r.cat.id}'::uuid,
  name = ${literal(r.cat.name)},
  icon = ${literal(r.cat.icon || r.bucket.icon)},
  budget_group = '${group}'::budget_group,
  parent_id = (
    select p.id
    from buckets p
    where p.category_id = '${r.cat.parent_id}'::uuid
      and p.kind = 'sinking'
      and p.is_active = true
      and p.parent_id is null
    limit 1
  )
where b.id = '${r.bucket.id}'::uuid;
`
}

sql += `
-- ---------------------------------------------------------------------------
-- C) Verify
-- ---------------------------------------------------------------------------
select
  b.name as bucket_name,
  b.icon,
  c.name as subcategory,
  pc.name as parent_category,
  pb.name as parent_bucket,
  b.category_id,
  b.parent_id
from buckets b
left join categories c on c.id = b.category_id
left join categories pc on pc.id = c.parent_id
left join buckets pb on pb.id = b.parent_id
where b.kind = 'sinking'
  and b.is_active = true
order by pc.name nulls first, b.name;

commit;
`

function literal(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

writeFileSync('supabase/map_legacy_sinking_to_categories.sql', sql, 'utf8')
console.log('Wrote supabase/map_legacy_sinking_to_categories.sql')
if (missing.length) process.exitCode = 1
