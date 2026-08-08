# Ndod Budget

PWA (Progressive Web App) pencatatan keuangan rumah tangga, dipakai kolaboratif oleh suami & istri. Bisa diinstall langsung ke home screen HP (Android/Samsung) seperti aplikasi biasa, tanpa perlu buka browser atau cari tab.

MVP saat ini fokus ke **input transaksi yang cepat & tanpa friksi** + riwayat + ringkasan sederhana. Dashboard PYF (Pay Yourself First) dan alert 50/30/20 direncanakan sebagai Phase 2 (lihat bagian [Roadmap](#roadmap-phase-2)).

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- `vite-plugin-pwa` (manifest + service worker, installable ke home screen)
- Supabase (Postgres + REST API + Realtime) sebagai backend
- Hosting: GitHub Pages (frontend statis) via GitHub Actions

## Keputusan Desain Penting

- **Tanpa login/password.** Saat pertama buka di HP, cukup pilih profil "Suami" atau "Istri" sekali — disimpan permanen di `localStorage` device tersebut. Tidak ditanya lagi.
- **Online-only.** App-shell (tampilan) di-cache oleh service worker supaya buka app instan, tapi mencatat transaksi tetap butuh koneksi internet (tidak ada offline sync).
- **Keamanan:** karena tanpa login, akses ke Supabase pakai `anon` public key dengan Row Level Security yang permisif (siapapun yang tahu URL app bisa baca/tulis data). Ini sengaja disederhanakan karena datanya adalah budget rumah tangga pribadi (bukan data sensitif seperti rekening/kartu), dan trade-off ini sudah disepakati demi input yang seamless. Kalau suatu saat mau menambah barrier ringan tanpa bikin ribet, opsi termudah adalah passphrase rumah tangga yang divalidasi client-side sebelum menyimpan `localStorage`.

## Setup

### 1. Buat project Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan isi [`supabase/schema.sql`](supabase/schema.sql).
3. Jalankan isi [`supabase/seed.sql`](supabase/seed.sql) untuk mengisi kategori + sub-kategori.
4. **Kalau project Supabase sudah dibuat sebelumnya** (sebelum sub-kategori), jalankan juga [`supabase/migrate_subcategories.sql`](supabase/migrate_subcategories.sql) sekali.
5. **Complete Later:** jalankan [`supabase/migrate_complete_later.sql`](supabase/migrate_complete_later.sql) sekali pada project yang sudah ada.
6. (Opsional) Jalankan [`supabase/seed_recurring_example.sql`](supabase/seed_recurring_example.sql) untuk mengisi tagihan rutin bulan ini supaya tidak mulai dari nol — sesuaikan dulu nominalnya kalau perlu.
7. Ambil `Project URL` dan `anon public key` dari **Project Settings > API**.

### 2. Konfigurasi environment

```bash
cp .env.example .env
```

Isi `.env` dengan URL & anon key dari Supabase, plus `VITE_HOUSEHOLD_PIN` (PIN rumah tangga, diminta sekali per device).

### 3. Install & jalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Untuk mencoba pengalaman "install ke home screen" di HP, jalankan `npm run build && npm run preview` lalu akses dari HP di jaringan yang sama (atau langsung coba dari versi yang sudah dideploy).

### 4. Deploy ke GitHub Pages

1. Push repo ini ke GitHub.
2. Di **Settings > Pages**, set **Source** ke `GitHub Actions`.
3. Di **Settings > Secrets and variables > Actions**, tambahkan secret `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `VITE_HOUSEHOLD_PIN`.
4. Push ke branch `main` — workflow [`deploy.yml`](.github/workflows/deploy.yml) otomatis build & deploy.
5. Buka URL GitHub Pages dari Chrome/Samsung Internet di HP, lalu **Add to Home Screen** / **Install App**.

## Struktur Kode

```
src/
  components/    # AmountKeypad, CategoryGrid, BottomNav (UI kecil, reusable)
  hooks/         # useCategories, useTransactions (data + realtime)
  lib/           # supabase client, types, format, profile (localStorage), transactionsApi
  screens/       # ProfilePicker, QuickAdd, History, Summary, Settings
supabase/        # schema.sql, seed.sql (jalankan manual di Supabase SQL Editor)
```

## Roadmap Phase 2

Skema database sudah menyiapkan tabel placeholder (`pyf_settings`, `sinking_funds`, `debts`) supaya fitur berikut tidak butuh migrasi besar:

- Dashboard PYF (mirror sheet `Ringkasan` di Excel lama): alokasi Tabungan Darurat/Investasi, dana tersedia vs pengeluaran aktual.
- Alert real-time sisa budget "Wants" (rule 50/30/20) — sinyal kalau sudah tanggal 20-an dan budget Wants menipis.
- Tracking saldo sinking fund (Pajak Mobil, Service Mobil) dari tabel `sinking_funds`.
- Countdown pelunasan cicilan pakai data tenor (`debts`).
- Opsional: passphrase ringan sebagai barrier tambahan, atau kanal Telegram bot kalau suatu saat dibutuhkan lagi.
