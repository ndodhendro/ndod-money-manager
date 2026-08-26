import { createClient } from '@supabase/supabase-js'

const viteEnv = import.meta.env as Record<string, string | undefined> | undefined
const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process
const nodeEnv = nodeProcess?.env
const supabaseUrl =
  viteEnv?.VITE_SUPABASE_URL ?? nodeEnv?.VITE_SUPABASE_URL
const supabaseAnonKey =
  viteEnv?.VITE_SUPABASE_ANON_KEY ?? nodeEnv?.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  // Surface a clear message in dev/prod console instead of a cryptic client error.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi. ' +
      'Salin .env.example ke .env dan isi kredensial Supabase kamu.',
  )
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      // No login flow in this app (see design notes) - disable auth persistence noise.
      persistSession: false,
    },
  },
)
