"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const fs = require("fs");
const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const { renderLayout } = require("./lib/siteChrome");
const {
  getAdminInboxStyles,
  renderAdminInboxContent,
  renderAdminLoginContent,
} = require("./lib/adminFeedbackHtml");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const SQL_DIR = path.join(ROOT, "sql");

const ADMIN_BASE_RAW = (process.env.ADMIN_BASE_PATH || "internal-sys").replace(/^\/+|\/+$/g, "");
const ADMIN_BASE = ADMIN_BASE_RAW.includes("/")
  ? "internal-sys"
  : ADMIN_BASE_RAW || "internal-sys";
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "changeme";

const IS_DEPLOYED =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_PUBLIC_DOMAIN);

const SESSION_SECRET = process.env.SESSION_SECRET || (IS_DEPLOYED ? "" : "dev-only-session-secret");

const SESSION_COOKIE_SECURE =
  process.env.SESSION_COOKIE_SECURE === "0"
    ? false
    : process.env.SESSION_COOKIE_SECURE === "1" ||
      process.env.NODE_ENV === "production" ||
      Boolean(process.env.RAILWAY_PUBLIC_DOMAIN);

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 10;
const rateBuckets = new Map();

function clientIp(req) {
  const xff = req.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

function rateLimitOk(ip) {
  if (!ip) return true;
  const now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, b);
  }
  if (b.count >= RATE_MAX) return false;
  b.count += 1;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of rateBuckets) {
    if (now > b.resetAt) rateBuckets.delete(ip);
  }
}, 60 * 1000).unref();

function parseAllowedHosts() {
  const raw = process.env.ALLOWED_HOSTS;
  if (!raw || !raw.trim()) return null;
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(req, allowed) {
  if (!allowed || allowed.length === 0) return true;
  const host = (req.get("host") || "").toLowerCase();
  return allowed.some((a) => host === a);
}

function refererOk(req) {
  const ref = req.get("referer");
  if (!ref) return true;
  try {
    const u = new URL(ref);
    const host = (req.get("host") || "").toLowerCase();
    return u.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function sslOptionForPg() {
  if (process.env.PGSSLMODE === "disable") return false;
  if (!process.env.DATABASE_URL) return false;
  const u = process.env.DATABASE_URL.toLowerCase();
  if (u.includes("localhost") || u.includes("127.0.0.1")) return false;
  return { rejectUnauthorized: false };
}

let pool = null;

async function runSqlFiles() {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL is not set; feedback and admin DB features are disabled");
    return;
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: sslOptionForPg(),
  });
  const files = fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (file.startsWith("99_")) continue;
    const full = path.join(SQL_DIR, file);
    const sql = fs.readFileSync(full, "utf8");
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn(`[db] ${file} single round-trip failed, splitting:`, e.message);
      const parts = sql
        .split(/;(?:\s*[\r\n]+|$)/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const part of parts) {
        await pool.query(part);
      }
    }
    console.log(`[db] applied ${file}`);
  }
  console.log("[db] schema ready");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateBody(body) {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const source =
    typeof body.source === "string" && body.source.trim()
      ? body.source.trim().slice(0, 64)
      : "contact_page";

  if (!message || message.length < 3) {
    return { error: "validation", detail: "message_too_short" };
  }
  if (message.length > 5000) {
    return { error: "validation", detail: "message_too_long" };
  }
  if (emailRaw && !EMAIL_RE.test(emailRaw)) {
    return { error: "validation", detail: "email_invalid" };
  }
  return { name: name || null, email: emailRaw || null, message, source };
}

async function verifyTurnstileToken(token, remoteip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || typeof token !== "string") return false;
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteip) body.set("remoteip", remoteip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await r.json().catch(() => ({}));
  return data.success === true;
}

function adminPrefixPath() {
  return `/${ADMIN_BASE}`;
}

/** Canonical browser URL for the admin inbox (sign-in + triage). */
function adminEntryHref() {
  return `${adminPrefixPath()}/admin`;
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

const allowedHosts = parseAllowedHosts();

app.use((req, res, next) => {
  if (!hostAllowed(req, allowedHosts)) {
    res.status(403).send("Forbidden");
    return;
  }
  next();
});

if (IS_DEPLOYED && !process.env.SESSION_SECRET) {
  console.error("[session] Set SESSION_SECRET when deployed (Railway variable).");
  process.exit(1);
}

app.use(
  session({
    name: "gyango.sid",
    secret: SESSION_SECRET || "dev-only-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: SESSION_COOKIE_SECURE,
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
    },
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "64kb",
  })
);

app.get("/healthz", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

app.get("/api/site-config.json", (_req, res) => {
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
  });
});

app.post("/api/feedback", async (req, res) => {
  if (typeof req.body?.company === "string" && req.body.company.trim() !== "") {
    res.redirect(303, "/contact.html");
    return;
  }

  if (!refererOk(req)) {
    res.redirect(303, "/contact.html?error=referer");
    return;
  }

  const ip = clientIp(req);
  if (!rateLimitOk(ip)) {
    res.redirect(303, "/contact.html?error=rate_limit");
    return;
  }

  if (!pool) {
    console.warn(
      "[feedback] DATABASE_URL is not set in this process — form submissions are disabled. " +
        "Set DATABASE_URL on Railway (reference Postgres) or in a root .env file for local runs."
    );
    res.redirect(303, "/contact.html?error=disabled");
    return;
  }

  const turnstileToken =
    typeof req.body["cf-turnstile-response"] === "string" ? req.body["cf-turnstile-response"] : "";
  if (process.env.TURNSTILE_SECRET_KEY) {
    let ok = false;
    try {
      ok = await verifyTurnstileToken(turnstileToken, ip);
    } catch (e) {
      console.error("[feedback] turnstile verify error", e);
      ok = false;
    }
    if (!ok) {
      res.redirect(303, "/contact.html?error=captcha");
      return;
    }
  }

  const parsed = validateBody(req.body);
  if (parsed.error) {
    res.redirect(
      303,
      `/contact.html?error=${encodeURIComponent(parsed.error)}&detail=${encodeURIComponent(parsed.detail)}`
    );
    return;
  }

  const ua = (req.get("user-agent") || "").slice(0, 2000) || null;

  try {
    await pool.query(
      `INSERT INTO feedback (name, email, message, source, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [parsed.name, parsed.email, parsed.message, parsed.source, ua, ip || null]
    );
  } catch (e) {
    console.error("[feedback] insert failed", e);
    res.redirect(303, "/contact.html?error=server");
    return;
  }

  res.redirect(303, "/contact.html?thanks=1");
});

function requireAdminSession(req, res, next) {
  if (!req.session?.admin) {
    res.redirect(303, `${adminEntryHref()}?login=required`);
    return;
  }
  next();
}

async function serveAdminInboxPage(req, res) {
  const base = adminPrefixPath();
  const href = adminEntryHref();

  if (!req.session?.admin) {
    const failed = req.query.login === "failed";
    const required = req.query.login === "required";
    res
      .status(200)
      .type("text/html")
      .send(
        renderLayout({
          title: "Admin · GyanGo",
          metaDescription: "Sign in to the internal feedback inbox.",
          activeNav: "admin",
          adminHref: href,
          extraHead: "",
          mainHtml: renderAdminLoginContent(base, { failed, required }),
        })
      );
    return;
  }

  if (!pool) {
    res
      .status(503)
      .type("text/html")
      .send(
        renderLayout({
          title: "Feedback · GyanGo",
          activeNav: "admin",
          adminHref: href,
          extraHead: "",
          mainHtml:
            '<section class="section"><div class="container"><p class="lead">Database is not configured on this server.</p></div></section>',
        })
      );
    return;
  }

  try {
    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, created_at, name, email, message, source, user_agent, ip, archived, admin_notes, workflow_status
         FROM feedback
         ORDER BY created_at DESC
         LIMIT 500`
      ),
      pool.query(`SELECT workflow_status, COUNT(*)::int AS n FROM feedback GROUP BY workflow_status`),
    ]);
    const rows = listRes.rows;
    const counts = { new: 0, reviewed: 0, acted: 0 };
    for (const r of countRes.rows) {
      const raw = r.workflow_status;
      const k = raw === "reviewed" || raw === "acted" ? raw : "new";
      counts[k] = (counts[k] || 0) + Number(r.n);
    }
    res
      .status(200)
      .type("text/html")
      .send(
        renderLayout({
          title: "Feedback inbox · GyanGo",
          metaDescription: "Internal feedback triage.",
          activeNav: "admin",
          adminHref: href,
          extraHead: `<style>${getAdminInboxStyles()}</style>`,
          mainHtml: renderAdminInboxContent(rows, counts, base),
        })
      );
  } catch (e) {
    console.error("[admin] list failed", e);
    res
      .status(500)
      .type("text/html")
      .send(
        renderLayout({
          title: "Admin error · GyanGo",
          activeNav: "admin",
          adminHref: href,
          extraHead: "",
          mainHtml:
            '<section class="section"><div class="container"><p class="lead">Could not load feedback. Try again in a moment.</p></div></section>',
        })
      );
  }
}

app.get(adminPrefixPath(), (_req, res) => {
  res.redirect(302, adminEntryHref());
});

app.get(`${adminPrefixPath()}/admin`, serveAdminInboxPage);
app.get(`${adminPrefixPath()}/feedback`, (_req, res) => {
  res.redirect(301, adminEntryHref());
});

app.post(`${adminPrefixPath()}/login`, (req, res) => {
  const u = String(req.body.admin_username || "").trim();
  const p = String(req.body.admin_password || "");
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    req.session.admin = true;
    res.redirect(303, adminEntryHref());
    return;
  }
  res.redirect(303, `${adminEntryHref()}?login=failed`);
});

app.post(`${adminPrefixPath()}/logout`, (req, res) => {
  req.session.destroy(() => {
    res.redirect(303, adminEntryHref());
  });
});

app.post(`${adminPrefixPath()}/feedback/action`, requireAdminSession, async (req, res) => {
  if (!pool) {
    res.redirect(303, adminEntryHref());
    return;
  }
  const id = Number.parseInt(String(req.body.id || ""), 10);
  const action = String(req.body.action || "");
  if (!Number.isFinite(id) || id < 1) {
    res.redirect(303, adminEntryHref());
    return;
  }
  try {
    if (action === "workflow") {
      const ws = String(req.body.workflow_status || "");
      if (["new", "reviewed", "acted"].includes(ws)) {
        const archived = ws === "acted";
        await pool.query(`UPDATE feedback SET workflow_status = $1, archived = $2 WHERE id = $3`, [ws, archived, id]);
      }
    } else if (action === "archive") {
      await pool.query(`UPDATE feedback SET archived = true WHERE id = $1`, [id]);
    } else if (action === "unarchive") {
      await pool.query(`UPDATE feedback SET archived = false WHERE id = $1`, [id]);
    } else if (action === "note") {
      const note =
        typeof req.body.admin_notes === "string" ? req.body.admin_notes.trim().slice(0, 2000) : "";
      await pool.query(`UPDATE feedback SET admin_notes = $1 WHERE id = $2`, [note || null, id]);
    }
  } catch (e) {
    console.error("[admin] action failed", e);
  }
  res.redirect(303, adminEntryHref());
});

app.use(
  express.static(PUBLIC_DIR, {
    index: ["index.html"],
    extensions: ["html"],
  })
);

runSqlFiles()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`[app] listening on port ${PORT}`);
      console.log(`[app] static → ${PUBLIC_DIR}`);
      if (ADMIN_USER === "admin" && ADMIN_PASS === "changeme") {
        console.warn("[app] Using default admin credentials (set ADMIN_USERNAME / ADMIN_PASSWORD on Railway)");
      }
      if (process.env.TURNSTILE_SECRET_KEY && !process.env.TURNSTILE_SITE_KEY) {
        console.warn(
          "[app] TURNSTILE_SECRET_KEY is set without TURNSTILE_SITE_KEY; contact submissions will fail captcha until both are set."
        );
      }
      console.log(`[app] Admin UI → ${adminEntryHref()}`);
    });

    async function shutdown(signal) {
      console.log(`[app] ${signal} received, closing…`);
      await new Promise((resolve) => server.close(resolve));
      if (pool) {
        try {
          await pool.end();
        } catch {
          /* ignore */
        }
      }
      process.exit(0);
    }
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("[app] failed to start", err);
    process.exit(1);
  });
