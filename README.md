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

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | Liveness |
| `GET /` … static | Files under [`public/`](public/) (HTML, CSS, JS, images) |
| `POST /api/feedback` | Contact form submission → `feedback` table |
| `GET /<ADMIN_BASE_PATH>/feedback` | **Internal** feedback table (HTTP Basic, `noindex`) |

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

Also stored: `user_agent`, client IP (from `X-Forwarded-For` when present), optional **`admin_notes`**, **`archived`** flag (toggle from the internal UI).

## SQL dumps / schema

Canonical DDL lives in [`sql/00_schema.sql`](sql/00_schema.sql). On startup, **`index.js` runs every `sql/*.sql` file except `99_*`** (see [`sql/README.md`](sql/README.md)).

Manual apply:

```bash
psql "$DATABASE_URL" -f sql/00_schema.sql
```

## Railway deployment

1. Connect this repo at the **repository root** (where `package.json` and `index.js` live).
2. Add **PostgreSQL** and **reference** its `DATABASE_URL` on the web service.
3. **Start command:** `npm start` → `node index.js`.
4. Set **`ALLOWED_HOSTS`** in production (comma-separated hostnames matching the `Host` header).
5. Set **`ADMIN_USERNAME`**, **`ADMIN_PASSWORD`**, and optionally **`ADMIN_BASE_PATH`**.
6. Optional: `PGSSLMODE=disable` for local Postgres without TLS.

The marketing site and API share the **same origin**; no CORS setup required for the contact form.

## Layout

| Path | Role |
|------|------|
| [`index.js`](index.js) | Express: static `public/`, feedback API, internal admin |
| [`public/`](public/) | Static site (formerly `website/`) |
| [`sql/`](sql/) | Schema and optional manual scripts |

More detail on static files: [`public/README.md`](public/README.md).
