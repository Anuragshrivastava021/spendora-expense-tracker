# Spendora — Expense Tracker

Spendora is a full-stack expense tracker with a database-driven public site and a
role-protected admin portal. The project uses React/Vite, Express, PostgreSQL,
JWTs in HTTP-only cookies, bcrypt password hashes, and Lucide icons.

## Requirements

- Node.js 20 or later and npm
- PostgreSQL 14 or later
- (Optional) an SMTP account for verification and password-reset email

## Setup (Windows PowerShell)

Open PowerShell in the project root:

```powershell
npm install
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env`: set `DATABASE_URL` to your PostgreSQL connection string and
replace `SESSION_SECRET` with a long, random value. For example, generate a
48-byte secret with:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Create the database if it does not already exist:

```powershell
createdb expense_tracker
```

Alternatively, use `psql`:

```powershell
psql -U postgres -c "CREATE DATABASE expense_tracker;"
```

Apply the schema and starter public-site content:

```powershell
npm run migrate
```

On the development machine where this project was connected, PostgreSQL 17 is
installed as a user-local portable server under
`$env:LOCALAPPDATA\NexoraBusiness` and the initialized database is already
created. If that local server has been stopped or Windows has restarted, start
it again with:

```powershell
$pg = Join-Path $env:LOCALAPPDATA 'NexoraBusiness\pgsql\bin\pg_ctl.exe'
$data = Join-Path $env:LOCALAPPDATA 'NexoraBusiness\data'
$log = Join-Path $env:LOCALAPPDATA 'NexoraBusiness\postgresql.log'
& $pg -D $data -l $log -o '-h 127.0.0.1 -p 5432' -w start
```

Create the first administrator from an interactive terminal. The password is
masked while it is typed; the script refuses to promote or overwrite an existing
account:

```powershell
npm run create-admin
```

Start the backend and frontend together:

```powershell
npm run dev
```

Open <http://localhost:5173>. The API listens at
<http://localhost:4001/api> in this workspace because another local application
already uses port 4000. The checked-in example defaults to port 4000 for a clean
machine; `backend/.env` and ignored `frontend/.env.local` hold this workspace's
local port settings. If your ports differ, set `PORT` in `backend/.env`,
`VITE_API_URL` in `frontend/.env.local`, and `FRONTEND_URL` in `backend/.env` to
the matching addresses.

## macOS / Linux

The same npm commands work in a POSIX shell. Copy the backend template and edit
its values:

```sh
npm install
cp backend/.env.example backend/.env
createdb expense_tracker
npm run migrate
npm run create-admin
npm run dev
```

Generate a secret using `openssl rand -base64 48`, then put it in
`backend/.env`.

## Branding

The shared UI wordmark is in `frontend/src/App.jsx`'s `Brand` component and
the browser title is in `frontend/index.html`. The starter homepage/About text
is seeded in `backend/schema.sql` so it remains editable from the admin portal.

## Environment variables

Backend settings live only in `backend/.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default `4000`) |
| `NODE_ENV` | Set to `production` for secure cookies and PostgreSQL TLS |
| `SESSION_SECRET` | At least 32 characters; signs seven-day session JWTs |
| `FRONTEND_URL` | Exact allowed frontend origin for credentialed CORS |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional SMTP delivery for verification/reset email |

Frontend settings are public build-time values only. `VITE_API_URL` defaults to
`http://localhost:4000/api`; do not put credentials or secrets in frontend
environment variables. `.env` files are ignored by Git.

If SMTP is not configured, registration creates verified accounts and password
reset requests return the same generic message without sending mail. Configure
all SMTP variables to enable email verification and one-hour password-reset
links. Token hashes, not raw reset/verification tokens, are stored in PostgreSQL.
For Gmail, use `smtp.gmail.com` on port `587`, your Gmail address as
`SMTP_USER`, and a Google App Password as `SMTP_PASSWORD` (not your regular
Google password). Keep that password only in `backend/.env`.

## What is implemented

- Responsive public homepage; published services and updates, hero and About
  content, and contact submissions are fetched from PostgreSQL.
- Registration, sign-in/out, profile edits, password changes, email verification
  (when SMTP is configured), and password reset.
- User-owned transactions and accounts, monthly category budgets, savings goals,
  recurring-bill reminders, and shared groups with member invitations, even
  expense splits, and per-person settlement tracking.
- Admin-only dashboard and APIs for user search/pagination, role changes,
  content create/edit/publish/unpublish/delete at `/admin`, page-view analytics,
  recent admin activity, a contact-message inbox, and CSV export of the current
  user results page.
- Admin audit events for content and role changes; public page-view tracking
  stores only a page path and timestamp, with no IP address or user agent.
- Parameterized PostgreSQL queries, server-side role checks, input validation,
  login/reset/contact rate limits, CORS origin restriction, CSRF double-submit
  checks, Helmet security headers, and HTTP-only session cookies.

Analytics use real stored views and registrations. A fresh install shows empty
analytics until page views and user registrations have occurred.

## Test and build

```powershell
npm test
npm run build
```

The backend test suite verifies API health, CSRF enforcement, input validation,
public registration's role boundary, authentication boundaries, and admin route
protection without needing a live database. Database-backed business flows
require a configured PostgreSQL instance and must be verified after setup.

## Production notes

Build the frontend using `npm run build`; the static output is in `frontend/dist`.
Deploy the API and static frontend behind HTTPS. The integrated frontend uses
the same-origin `/api` path in production; if you host the frontend separately,
set `VITE_API_URL` and `FRONTEND_URL` to their exact public origins. Use a
least-privilege PostgreSQL role and provide a strong secret from a secrets
manager. Run migrations before deploying new API versions. Back up the
database, monitor SMTP delivery and database health, and rotate secrets if
exposed. Cookies are marked `Secure` in production.

Additional administrators should be provisioned only from a trusted terminal
with `npm run create-admin`; the public registration endpoint never accepts or
assigns an administrator role.

### Render preview

The root `render.yaml` describes a single-origin Render preview: one web service
serves the built frontend and API, with a fresh PostgreSQL database. Import the
GitHub repository as a Render Blueprint and review the plan shown by Render
before creating resources. The preview selects free plans: the web service may
sleep while idle, and Render's free PostgreSQL databases expire after 30 days,
so this setup is unsuitable for important or long-term financial records. No
local database records are copied. The generated `SESSION_SECRET` is managed by
Render. SMTP and administrator setup remain separate; do not add passwords or
database URLs to the repository.
