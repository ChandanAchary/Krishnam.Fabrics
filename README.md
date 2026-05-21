# LabourFlow — Next.js

**Labour Management Platform** built with **Next.js 14 (App Router)**, using **Supabase** for database + auth and **Brevo** for transactional email (OTP-verified email/password changes).

This is the Next.js implementation of the same LabourFlow app (originally React + Vite). Same features, same database schema — re-architected for Next.js.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 14** (App Router, React 18, TypeScript strict) |
| Styling | Tailwind CSS v3 |
| Database + Auth | **Supabase** (Postgres 15, RLS, JWT auth) via `@supabase/ssr` |
| Email | **Brevo** transactional API, called from a Next.js **API route** (server-side) |
| Forms / validation | react-hook-form + zod |
| Dates / PDF / icons | date-fns · jsPDF + AutoTable · lucide-react |

### How the pieces fit
- **Auth**: cookie-based sessions via `@supabase/ssr`. `src/middleware.ts` protects all routes (redirects to `/login` when signed out) and refreshes the session.
- **Database**: all data + business logic live in Supabase (tables, RLS, and Postgres functions/RPCs). The browser talks to Supabase directly with the anon/publishable key under RLS.
- **Email (Brevo)**: the OTP flow for changing email/password runs in `src/app/api/account-otp/route.ts`. That server route holds the **service-role key** and **Brevo API key** (never exposed to the browser), sends the code via Brevo, and performs the privileged auth update after verifying the code. No Supabase Edge Function is needed.

---

## Project structure

```
My App/
├── package.json, next.config.mjs, tsconfig.json, tailwind.config.ts, postcss.config.mjs
├── .env.example
├── src/
│   ├── middleware.ts                 # auth protection + session refresh
│   ├── app/
│   │   ├── layout.tsx                # root layout + providers
│   │   ├── globals.css               # Tailwind + component primitives
│   │   ├── providers.tsx             # Toast / Auth / Settings context providers
│   │   ├── page.tsx                  # → redirects to /dashboard
│   │   ├── login/ , forgot-password/ # public auth pages
│   │   ├── (app)/                    # authenticated route group (sidebar layout)
│   │   │   ├── layout.tsx            # ProtectedRoute + AppLayout
│   │   │   ├── dashboard/
│   │   │   ├── labourers/ , labourers/new/ , labourers/[id]/
│   │   │   ├── attendance/ , attendance/[date]/
│   │   │   ├── attendance-sheet/
│   │   │   ├── salary/ , salary/[year]/[month]/
│   │   │   ├── reports/
│   │   │   ├── settings/             # AdminGuard
│   │   │   └── audit-logs/           # AdminGuard
│   │   └── api/account-otp/route.ts  # Brevo OTP (server-side)
│   ├── views/                        # page UI components (rendered by app routes)
│   ├── components/                   # ui / layout / auth / attendance / labourers / salary / dashboard / settings
│   ├── context/                      # AuthContext, ToastContext, SettingsContext
│   ├── hooks/                        # useLabourerEdit, useAttendanceActions, useSalaryActions
│   ├── lib/                          # supabase (browser), supabase-server, date, money, csv, pdf, audit, otp, utils
│   └── types/database.ts
└── supabase/
    ├── migrations/                   # 7 SQL migrations (identical schema to the React build)
    ├── create_admin.sql              # activate the admin account
    ├── SETUP_ALL.sql                 # all migrations + admin in one paste
    ├── seed.sql
    └── config.toml
```

---

## Setup

### 1. Install
```bash
cd "My App"
cp .env.example .env.local      # fill in the values (see below)
npm install
```

### 2. Environment variables (`.env.local`)
Only two are required — the app uses **native Supabase Auth**, so no service-role key is needed:

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon / publishable key |
| `NEXT_PUBLIC_APP_NAME` | public (optional) | branding |

### 3. Database (Supabase)
In the Supabase dashboard → **SQL Editor**, paste and run **`supabase/SETUP_ALL.sql`** once. It creates all tables, functions, and RLS policies (schema only — you create the first account from the app).

Then enable the JWT role hook: **Authentication → Hooks → Custom Access Token** → select `custom_access_token_hook`.

### 4. Email delivery via Brevo (Supabase SMTP)
Auth emails (account confirmation + password reset) are sent by Supabase. To route them through **Brevo** (and see them in Brevo logs):

**Supabase Dashboard → Project Settings → Authentication → SMTP Settings → Enable Custom SMTP:**
| Field | Value |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | your Brevo SMTP **login** (Brevo → SMTP & API → SMTP) |
| Password | your Brevo SMTP **key** |
| Sender email | a **verified** sender on a domain you control (not `@gmail.com`) |
| Sender name | `LabourFlow` |

Also add redirect URLs under **Authentication → URL Configuration → Redirect URLs**:
`http://localhost:3000/**` (and your production URL).

> Tip: To skip email confirmation on signup during development, turn **Authentication → Providers → Email → "Confirm email"** OFF. Then registration logs you straight in.

### 5. Run
```bash
npm run dev      # http://localhost:3000
```

### First account
There is **no default admin**. On first run (no accounts yet) the app shows the **Register** screen — the first account you create becomes the **admin**. After that, the app shows **Login**.

---

## Scripts
| Command | Description |
|---|---|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next lint) |

---

## Authentication flow (native Supabase Auth)
- **Register** (`/register`) — first-run only. Name, email, password, confirm (validated: ≥8 chars, a letter + a number, passwords match). Uses `supabase.auth.signUp`; the first account becomes **admin** (DB trigger). Once an account exists, `/register` redirects to `/login`.
- **Login** (`/login`) — `signInWithPassword`. On first run (no accounts) it redirects to `/register`.
- **Forgot password** (`/forgot-password` → email link → `/reset-password`):
  1. User enters their email → `supabase.auth.resetPasswordForEmail(...)` sends a secure reset link (via your Brevo SMTP).
  2. User clicks the link → lands on `/reset-password`, where the recovery session lets them set a new password (`updateUser`).
  3. User signs in with the new password.
- **Settings → Account security** — change password (`updateUser({ password })`) and change email (`updateUser({ email })`, confirmation link sent) while signed in.

All emails go through Supabase Auth → your Brevo SMTP relay, so they appear in your Brevo logs. **No service-role key and no custom OTP endpoints** are used.

---

## Deployment (Vercel)
1. Push to GitHub, import into Vercel. Root directory = `My App`.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in **Project Settings → Environment Variables**.
3. Add your production URL to Supabase **Authentication → URL Configuration → Redirect URLs**.
4. Deploy. Next.js middleware + SSR run on Vercel out of the box.

For any other Node host: `npm run build` then `npm run start` (Next.js needs a Node runtime for middleware — it is **not** a static export).

---

## Notes
- Supabase is used as **database + auth only**. There are **no Supabase Edge Functions** and **no custom API routes** — authentication is fully native, and email is delivered via Supabase's SMTP (pointed at Brevo).
- The SQL schema (tables, RLS, RPCs) matches the React/Vite version. Migration `…0007` adds `app_user_count()` used to toggle the Register/Login screen.
