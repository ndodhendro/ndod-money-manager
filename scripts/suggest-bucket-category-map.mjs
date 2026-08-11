import { readFileSync } from 'fs'

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
  'select=id,name,icon&kind=eq.sinking&is_active=eq.true&order=name',
)
const cats = await get(
  'categories',
  'select=id,name,icon,parent_id,type,is_active&type=eq.expense&is_active=eq.true',
)

const parents = new Map(cats.filter((c) => !c.parent_id).map((c) => [c.id, c]))
const subs = cats.filter((c) => c.parent_id)

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const suggestions = []
for (const b of buckets) {
  const bn = norm(b.name)
  const exact = subs.filter((c) => norm(c.name) === bn)
  const fuzzy = subs.filter((c) => {
    const cn = norm(c.name)
    return cn.includes(bn) || bn.includes(cn)
  })
  const hits = (exact.length ? exact : fuzzy).slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    parent: parents.get(c.parent_id)?.name || '?',
  }))
  suggestions.push({
    bucket: b.name,
    bucket_id: b.id,
    match_type: exact.length ? 'exact' : hits.length ? 'fuzzy' : 'none',
    matches: hits,
  })
}

console.log(JSON.stringify(suggestions, null, 2))
