"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const fs = require("fs");
const express = require("express");
const { Pool } = require("pg");
const renderAdminFeedbackPage = require("./lib/adminFeedbackHtml");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const SQL_DIR = path.join(ROOT, "sql");

/** Hidden admin UI (HTTP Basic). Override path with ADMIN_BASE_PATH (single segment, no slashes). */
const ADMIN_BASE_RAW = (process.env.ADMIN_BASE_PATH || "internal-sys").replace(/^\/+|\/+$/g, "");
const ADMIN_BASE = ADMIN_BASE_RAW.includes("/")
  ? "internal-sys"
  : ADMIN_BASE_RAW || "internal-sys";
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "changeme";

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

function parseBasicAuth(header) {
  if (!header || !header.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return null;
  return { user: decoded.slice(0, colon), pass: decoded.slice(colon + 1) };
}

function adminAuth(req, res, next) {
  const creds = parseBasicAuth(req.get("authorization"));
  if (!creds || creds.user !== ADMIN_USER || creds.pass !== ADMIN_PASS) {
    res.set("WWW-Authenticate", 'Basic realm="GyanGo"');
    res.status(401).type("text/plain").send("Unauthorized");
    return;
  }
  next();
}

function adminPrefixPath() {
  return `/${ADMIN_BASE}`;
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

app.use(
  express.urlencoded({
    extended: false,
    limit: "64kb",
  })
);

app.get("/healthz", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
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

app.get(`${adminPrefixPath()}/feedback`, adminAuth, async (_req, res) => {
  if (!pool) {
    res.status(503).type("text/html").send("<p>Database not configured.</p>");
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
      pool.query(
        `SELECT workflow_status, COUNT(*)::int AS n FROM feedback GROUP BY workflow_status`
      ),
    ]);
    const rows = listRes.rows;
    const counts = { new: 0, reviewed: 0, acted: 0 };
    for (const r of countRes.rows) {
      const raw = r.workflow_status;
      const k = raw === "reviewed" || raw === "acted" ? raw : "new";
      counts[k] = (counts[k] || 0) + Number(r.n);
    }
    res.status(200).type("text/html").send(renderAdminFeedbackPage(rows, counts, adminPrefixPath()));
  } catch (e) {
    console.error("[admin] list failed", e);
    res.status(500).type("text/html").send("<p>Failed to load feedback.</p>");
  }
});

app.post(`${adminPrefixPath()}/feedback/action`, adminAuth, async (req, res) => {
  if (!pool) {
    res.redirect(303, `${adminPrefixPath()}/feedback`);
    return;
  }
  const id = Number.parseInt(String(req.body.id || ""), 10);
  const action = String(req.body.action || "");
  if (!Number.isFinite(id) || id < 1) {
    res.redirect(303, `${adminPrefixPath()}/feedback`);
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
  res.redirect(303, `${adminPrefixPath()}/feedback`);
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
      console.log(`[app] Internal feedback UI → ${adminPrefixPath()}/feedback`);
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
