# gyango-ui

Single **Node + static** app for the GyanGo marketing site, **feedback intake**, and a **hidden admin** view backed by **PostgreSQL**. Deploy to [Railway](https://railway.app/) with one service and a Postgres plugin.

## Local development

```bash
cd /path/to/gyango-ui
npm install
cp .env.example .env
# set DATABASE_URL when testing DB features
npm start
```

Open **http://localhost:3000** (Railway sets `PORT` in production).

**If the contact form says the database is not configured:** the app only enables `POST /api/feedback` when **`DATABASE_URL`** is present at startup. Create a `.env` in the repo root (see [`.env.example`](.env.example)) with `DATABASE_URL=...`, or export it in your shell before `npm start`. On Railway, add a **variable reference** from your Postgres service to the **web** service (not only on the database service).

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | Liveness |
| `GET /` … static | Files under [`public/`](public/) (HTML, CSS, JS, images) |
| `POST /api/feedback` | Contact form submission → `feedback` table |
| `GET /<ADMIN_BASE_PATH>/feedback` | **Internal** feedback inbox (HTTP Basic, `noindex`): compact rows, expand for full message / UA / triage (**new → reviewed → acted**) |

Default admin path segment: **`internal-sys`** → e.g. `http://localhost:3000/internal-sys/feedback`

### Admin credentials (HTTP Basic)

Set on Railway (do **not** ship defaults in production):

| Variable | Default (local only) |
|----------|----------------------|
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | `changeme` |
| `ADMIN_BASE_PATH` | `internal-sys` (no slashes) |

The server logs a warning if defaults are still in use.

### Feedback form (`POST /api/feedback`)

| Field | Required | Notes |
|-------|----------|--------|
| `message` | Yes | 3–5000 characters |
| `email` | No | Validated if present |
| `name` | No | Max 200 characters |
| `source` | No | Hidden; default `contact_page` |
| `company` | — | Honeypot (must be empty) |

Also stored: `user_agent`, client IP (from `X-Forwarded-For` when present), optional **`admin_notes`**, **`archived`**, and **`workflow_status`** (`new` | `reviewed` | `acted`) for the internal inbox.

## SQL dumps / schema

Canonical DDL lives in [`sql/00_schema.sql`](sql/00_schema.sql). On startup, **`index.js` runs every `sql/*.sql` file except `99_*`** (see [`sql/README.md`](sql/README.md)).

Manual apply:

```bash
psql "$DATABASE_URL" -f sql/00_schema.sql
```

## Railway release checklist

Config-as-code lives in [`railway.json`](railway.json): **Railpack** build, **`npm start`**, **`/healthz`** health check (120s timeout), **restart on failure**. Railway merges this with dashboard settings (file wins on conflicts).

1. **New Railway project** → **Deploy from GitHub** (or GitLab) → select this repository. Use the **repo root** as the service root (where `package.json`, `index.js`, and `railway.json` live).
2. **Add PostgreSQL:** **New** → **Database** → **Add PostgreSQL**.
3. **Wire `DATABASE_URL`:** Open your **web** service → **Variables** → **Add variable** → **Reference** → choose the Postgres service → **`DATABASE_URL`**. (Avoid pasting secrets into chat or commits.)
4. **Production variables** (web service → Variables):

   | Variable | Recommended |
   |----------|-------------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Reference from Postgres (required for feedback + admin) |
   | `ALLOWED_HOSTS` | Your public hostname(s), comma-separated (e.g. `www.example.com,example.com`) — **strongly recommended** in production |
   | `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Strong unique values (replace defaults) |
   | `ADMIN_BASE_PATH` | Optional; obscure path segment (default `internal-sys`) |

   **`PORT`** is set by Railway automatically — do not override unless you know why.

5. **Networking:** **Settings** → **Networking** → generate a **public domain** or attach your custom domain. Put the same hostname(s) into `ALLOWED_HOSTS` if you use that guard.
6. **Deploy:** Push to the connected branch (or **Redeploy** from the dashboard). Watch **Deploy logs** for `[db] applied 00_schema.sql` and `listening on port`.
7. **Smoke test:** Open `/`, submit `/contact.html` feedback, then open `https://<your-host>/<ADMIN_BASE_PATH>/feedback` (Basic auth) and confirm the row appears.
8. **Optional:** Update canonical URLs in [`public/`](public/) (`og:url`, `sitemap.xml`, etc.) to match your live domain.

Node version for builds is pinned via [`.node-version`](.node-version) (20.x), matching [`package.json`](package.json) `engines.node`. The marketing site and API share the **same origin** (no CORS setup for the contact form).

## Layout

| Path | Role |
|------|------|
| [`railway.json`](railway.json) | Railway: Railpack, start command, `/healthz` health check |
| [`index.js`](index.js) | Express: static `public/`, feedback API, admin routes |
| [`lib/adminFeedbackHtml.js`](lib/adminFeedbackHtml.js) | Internal feedback inbox HTML (matches public site palette) |
| [`public/`](public/) | Static site (formerly `website/`) |
| [`sql/`](sql/) | Schema and optional manual scripts |

More detail on static files: [`public/README.md`](public/README.md).
