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

const res = await fetch(
  `${base}/rest/v1/categories?select=id,name,icon,parent_id,is_active,type&or=(name.ilike.*Subscrip*,name.ilike.*Youtube*,name.ilike.*Premium*)&type=eq.expense`,
  { headers },
)
console.log(await res.json())

const all = await fetch(
  `${base}/rest/v1/categories?select=id,name,parent_id,is_active&type=eq.expense&is_active=eq.true&order=name`,
  { headers },
).then((r) => r.json())

const lifestyle = all.filter(
  (c) => !c.parent_id && c.name.toLowerCase().includes('life'),
)
console.log('lifestyle parents', lifestyle)
for (const p of lifestyle) {
  console.log(
    'children',
    all.filter((c) => c.parent_id === p.id).map((c) => c.name),
  )
}
