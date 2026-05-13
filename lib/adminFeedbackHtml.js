"use strict";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhenUtc(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function previewMessage(raw, max) {
  if (!raw) return "—";
  const one = String(raw).replace(/\s+/g, " ").trim();
  const m = typeof max === "number" ? max : 100;
  if (one.length <= m) return one;
  return `${one.slice(0, m)}…`;
}

function normalizeWorkflow(w) {
  if (w === "reviewed" || w === "acted") return w;
  return "new";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailCell(raw) {
  const t = (raw || "").trim();
  if (t && EMAIL_RE.test(t)) {
    return `<a class="fb-mail" href="mailto:${t}">${escapeHtml(t)}</a>`;
  }
  return escapeHtml(t || "—");
}

function workflowForm(base, id, value, label, variant) {
  return `<form method="post" action="${base}/feedback/action" class="fb-wf">
  <input type="hidden" name="id" value="${id}">
  <input type="hidden" name="action" value="workflow">
  <input type="hidden" name="workflow_status" value="${value}">
  <button type="submit" class="fb-btn fb-btn--${variant}">${label}</button>
</form>`;
}

function buildRowsHtml(rows, base) {
  if (!rows.length) {
    return `<tr><td colspan="7" class="fb-empty">No submissions yet.</td></tr>`;
  }
  return rows
    .map((row) => {
      const id = Number(row.id);
      const wf = normalizeWorkflow(row.workflow_status);
      const when = escapeHtml(formatWhenUtc(row.created_at));
      const preview = escapeHtml(previewMessage(row.message, 96));
      const name = escapeHtml(row.name || "—");
      const email = emailCell(row.email);
      const msgFull = escapeHtml(row.message || "");
      const src = escapeHtml(row.source || "—");
      const ua = escapeHtml(row.user_agent || "—");
      const ip = escapeHtml(row.ip || "—");
      const note = escapeHtml(row.admin_notes || "");

      return `<tr class="fb-sum" data-id="${id}" data-workflow="${wf}" role="button" tabindex="0" aria-expanded="false" aria-controls="fb-det-${id}">
  <td class="fb-chev"><span class="fb-chev-icon" aria-hidden="true">▸</span></td>
  <td class="fb-mono">#${id}</td>
  <td class="fb-when fb-col-hide-xs">${when}</td>
  <td class="fb-name">${name}</td>
  <td class="fb-email fb-col-hide-narrow">${email}</td>
  <td class="fb-preview fb-col-hide-narrow">${preview}</td>
  <td><span class="fb-badge fb-badge--${wf}">${wf}</span></td>
</tr>
<tr class="fb-det" id="fb-det-${id}" hidden>
  <td colspan="7">
    <div class="fb-detail">
      <div class="fb-detail-grid">
        <section class="fb-panel">
          <h4>Message</h4>
          <pre class="fb-pre">${msgFull}</pre>
        </section>
        <section class="fb-panel">
          <h4>Technical</h4>
          <dl class="fb-dl">
            <div><dt>Source</dt><dd>${src}</dd></div>
            <div><dt>IP</dt><dd>${ip}</dd></div>
          </dl>
          <h4 class="fb-h4">User agent</h4>
          <pre class="fb-pre fb-pre--small">${ua}</pre>
        </section>
        <section class="fb-panel fb-panel--actions">
          <h4>Progress</h4>
          <p class="fb-muted">New → Reviewed → Acted (acted also archives the row).</p>
          <div class="fb-wf-row">
            ${workflowForm(base, id, "new", "New", "ghost")}
            ${workflowForm(base, id, "reviewed", "Reviewed", "secondary")}
            ${workflowForm(base, id, "acted", "Acted", "primary")}
          </div>
          <h4>Internal note</h4>
          <form method="post" action="${base}/feedback/action" class="fb-note-form">
            <input type="hidden" name="id" value="${id}">
            <input type="hidden" name="action" value="note">
            <textarea name="admin_notes" rows="3" placeholder="Private note (team only)">${note}</textarea>
            <button type="submit" class="fb-btn fb-btn--secondary">Save note</button>
          </form>
        </section>
      </div>
    </div>
  </td>
</tr>`;
    })
    .join("\n");
}

function getAdminInboxStyles() {
  return `
    .admin-inbox-root {
      --fb-radius: 12px;
      --fb-shadow: 0 4px 20px rgba(31, 41, 51, 0.07);
      --fb-pad-x: clamp(0.85rem, 4vw, 1.25rem);
      padding: 0.75rem 0 2.5rem;
      touch-action: manipulation;
    }
    .fb-top {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      box-shadow: var(--fb-shadow);
    }
    .fb-top-inner {
      width: min(1120px, 92%);
      margin: 0 auto;
      padding: 1rem var(--fb-pad-x) 1.15rem;
    }
    .fb-brand { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
    .fb-brand h1 { margin: 0; font-size: clamp(1.05rem, 2.8vw, 1.25rem); font-weight: 700; color: var(--accent-dark); letter-spacing: -0.02em; line-height: 1.25; }
    .fb-brand-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
    .fb-inline-form { margin: 0; }
    .fb-sub { margin: 0.35rem 0 0; font-size: 0.85rem; color: var(--muted); line-height: 1.45; }
    .fb-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1.1rem; }
    @media (max-width: 640px) { .fb-stats { grid-template-columns: 1fr; } }
    .fb-stat { background: var(--surface-soft); border: 1px solid var(--border); border-radius: var(--fb-radius); padding: 0.85rem 1rem; }
    .fb-stat-n { font-size: 1.65rem; font-weight: 700; color: var(--accent-dark); line-height: 1.1; }
    .fb-stat-l { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .fb-stat-t { margin-top: 0.25rem; font-size: 0.8rem; color: var(--muted); }
    .fb-toolbar {
      width: min(1120px, 92%);
      margin: 0 auto;
      padding: 0.65rem var(--fb-pad-x) 0.85rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem 0.5rem;
    }
    .fb-toolbar span { font-size: 0.85rem; color: var(--muted); margin-right: 0.15rem; flex-basis: 100%; }
    @media (min-width: 480px) {
      .fb-toolbar span { flex-basis: auto; margin-right: 0.35rem; }
    }
    .fb-filter {
      border: 1px solid var(--border); background: var(--surface); color: var(--ink); font: inherit; font-weight: 600;
      font-size: 0.88rem; padding: 0.5rem 0.9rem; min-height: 2.75rem; border-radius: 999px; cursor: pointer;
      touch-action: manipulation;
    }
    .fb-filter:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
    .fb-filter.is-active {
      background: color-mix(in srgb, var(--accent) 14%, var(--surface));
      border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); color: var(--accent-dark);
    }
    .fb-wrap { width: min(1120px, 92%); margin: 0 auto; padding: 0 var(--fb-pad-x) 2.5rem; }
    .fb-mobile-hint {
      display: none;
      font-size: 0.82rem;
      color: var(--muted);
      line-height: 1.45;
      margin: 0 0 0.65rem;
      padding: 0.5rem 0.75rem;
      background: var(--surface-soft);
      border-radius: var(--fb-radius);
      border: 1px solid var(--border);
    }
    @media (max-width: 640px) { .fb-mobile-hint { display: block; } }
    .fb-table-wrap {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--fb-radius);
      box-shadow: var(--fb-shadow);
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
    }
    table.fb-table { width: 100%; border-collapse: collapse; min-width: 720px; }
    @media (max-width: 640px) {
      table.fb-table { min-width: 0; }
      .admin-inbox-root .fb-col-hide-narrow { display: none !important; }
    }
    @media (max-width: 420px) {
      .admin-inbox-root .fb-col-hide-xs { display: none !important; }
    }
    .fb-table th, .fb-table td { padding: 0.65rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); vertical-align: middle; font-size: 0.92rem; }
    .fb-table thead th {
      background: var(--surface-soft); font-weight: 600; font-size: 0.78rem; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--muted);
    }
    .fb-sum { cursor: pointer; transition: background 0.12s ease; }
    .fb-sum:hover { background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
    @media (max-width: 640px) {
      .fb-sum { min-height: 2.75rem; }
      .fb-sum td { vertical-align: middle; }
      .fb-brand-actions .fb-btn { min-height: 2.75rem; width: 100%; justify-content: center; }
      .fb-brand-actions { width: 100%; }
    }
    .fb-sum[aria-expanded="true"] { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
    .fb-chev { width: 2.25rem; text-align: center; color: var(--muted); }
    .fb-chev-icon { font-size: 0.85rem; }
    .fb-mono { font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 600; }
    .fb-when { white-space: nowrap; color: var(--ink); font-size: 0.88rem; }
    @media (max-width: 640px) {
      .fb-when { white-space: normal; max-width: 10rem; font-size: 0.82rem; line-height: 1.35; }
    }
    .fb-name { max-width: 10rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (min-width: 641px) { .fb-name { max-width: 14rem; } }
    .fb-email { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fb-mail { font-weight: 600; }
    .fb-preview { color: var(--muted); max-width: 280px; line-height: 1.4; font-size: 0.88rem; }
    .fb-badge { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.28rem 0.55rem; border-radius: 999px; border: 1px solid var(--border); }
    .fb-badge--new { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); color: var(--accent-dark); }
    .fb-badge--reviewed { background: #f0f4e8; border-color: #c9d4b8; color: #4a5a3d; }
    .fb-badge--acted { background: var(--surface-soft); color: var(--muted); opacity: 0.95; }
    .fb-det td { padding: 0; border-bottom: 1px solid var(--border); background: var(--bg); }
    .fb-detail { padding: 1rem 1.1rem 1.25rem; }
    .fb-detail-grid { display: grid; gap: 1rem; }
    @media (min-width: 900px) { .fb-detail-grid { grid-template-columns: 1.2fr 1fr 1fr; } }
    .fb-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--fb-radius); padding: 0.85rem 1rem; }
    .fb-panel h4, .fb-h4 { margin: 0 0 0.5rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
    .fb-h4 { margin-top: 0.85rem; }
    .fb-pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.85rem; line-height: 1.45; color: var(--ink); max-height: 280px; overflow: auto; }
    .fb-pre--small { font-size: 0.78rem; max-height: 160px; color: var(--muted); }
    .fb-dl { margin: 0; }
    .fb-dl > div { margin-bottom: 0.45rem; }
    .fb-dl dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; }
    .fb-dl dd { margin: 0.15rem 0 0; font-size: 0.88rem; word-break: break-all; }
    .fb-muted { margin: 0 0 0.65rem; font-size: 0.82rem; color: var(--muted); }
    .fb-wf { display: inline; margin: 0; padding: 0; }
    .fb-wf-row { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1rem; }
    @media (max-width: 640px) {
      .fb-wf-row { flex-direction: column; align-items: stretch; }
      .fb-wf-row .fb-wf { display: block; width: 100%; }
      .fb-wf-row .fb-btn { width: 100%; }
    }
    .fb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      font: inherit; font-weight: 600; font-size: 0.85rem; padding: 0.45rem 0.85rem; min-height: 2.5rem;
      border-radius: 999px; border: 1px solid var(--border); cursor: pointer; background: var(--surface); color: var(--accent-dark);
      touch-action: manipulation;
    }
    .fb-btn--primary { background: var(--accent-dark); color: #fff; border-color: var(--accent-dark); }
    .fb-btn--primary:hover { filter: brightness(1.05); }
    .fb-btn--secondary:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); background: var(--surface-soft); }
    .fb-btn--ghost { background: transparent; }
    .fb-note-form textarea { width: 100%; max-width: 100%; margin-bottom: 0.45rem; padding: 0.55rem 0.65rem; border-radius: 10px; border: 1px solid var(--border); font: inherit; resize: vertical; min-height: 72px; }
    .fb-empty { text-align: center; padding: 2rem 1rem !important; color: var(--muted); }
    .fb-sum:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  `;
}

function renderAdminInboxContent(rows, counts, base) {
  const cNew = counts.new ?? 0;
  const cRev = counts.reviewed ?? 0;
  const cAct = counts.acted ?? 0;
  const total = cNew + cRev + cAct;
  const tbody = buildRowsHtml(rows, base);

  return `<div class="admin-inbox-root" data-filter="all">
  <div class="fb-top">
    <div class="fb-top-inner">
      <div class="fb-brand">
        <div>
          <h1>Feedback inbox</h1>
          <p class="fb-sub">Signed in · up to 500 submissions · expand a row for full details</p>
        </div>
        <div class="fb-brand-actions">
          <form method="post" action="${base}/logout" class="fb-inline-form">
            <button type="submit" class="fb-btn fb-btn--ghost">Sign out</button>
          </form>
        </div>
      </div>
      <div class="fb-stats">
        <div class="fb-stat"><div class="fb-stat-n">${cNew}</div><div class="fb-stat-l">New</div><div class="fb-stat-t">Needs first look</div></div>
        <div class="fb-stat"><div class="fb-stat-n">${cRev}</div><div class="fb-stat-l">Reviewed</div><div class="fb-stat-t">In progress</div></div>
        <div class="fb-stat"><div class="fb-stat-n">${cAct}</div><div class="fb-stat-l">Acted</div><div class="fb-stat-t">Done / archived</div></div>
      </div>
      <p class="fb-sub" style="margin-top:0.75rem">Total in database (all statuses): <strong>${total}</strong></p>
    </div>
  </div>
  <div class="fb-toolbar">
    <span>Show</span>
    <button type="button" class="fb-filter is-active" data-set-filter="all">All</button>
    <button type="button" class="fb-filter" data-set-filter="new">New</button>
    <button type="button" class="fb-filter" data-set-filter="reviewed">Reviewed</button>
    <button type="button" class="fb-filter" data-set-filter="acted">Acted</button>
  </div>
  <div class="fb-wrap">
    <p class="fb-mobile-hint">On small screens, email and preview are hidden here—tap a row to open the full message, email, and triage actions.</p>
    <div class="fb-table-wrap">
      <table class="fb-table">
        <thead>
          <tr>
            <th class="fb-chev" aria-label="Expand"></th>
            <th>ID</th>
            <th class="fb-col-hide-xs">Received (UTC)</th>
            <th>Name</th>
            <th class="fb-col-hide-narrow">Email</th>
            <th class="fb-col-hide-narrow">Preview</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </div>
  <script>
(function () {
  var root = document.querySelector(".admin-inbox-root");
  if (!root) return;
  function applyFilter(f) {
    root.setAttribute("data-filter", f);
    root.querySelectorAll("[data-set-filter]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-set-filter") === f);
    });
    root.querySelectorAll(".fb-det").forEach(function (d) {
      d.setAttribute("hidden", "");
    });
    root.querySelectorAll(".fb-sum").forEach(function (r) {
      r.setAttribute("aria-expanded", "false");
      var ic = r.querySelector(".fb-chev-icon");
      if (ic) ic.textContent = "▸";
      var show = f === "all" || r.getAttribute("data-workflow") === f;
      r.style.display = show ? "" : "none";
    });
  }
  root.querySelectorAll("[data-set-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyFilter(btn.getAttribute("data-set-filter") || "all");
    });
  });
  function toggleRow(row) {
    var id = row.getAttribute("data-id");
    var det = root.querySelector("#fb-det-" + id);
    if (!det) return;
    var opening = det.hidden;
    det.hidden = !opening;
    row.setAttribute("aria-expanded", opening ? "true" : "false");
    var icon = row.querySelector(".fb-chev-icon");
    if (icon) icon.textContent = opening ? "▾" : "▸";
  }
  root.querySelectorAll(".fb-sum").forEach(function (row) {
    row.addEventListener("click", function (ev) {
      if (ev.target.closest("a,button,input,textarea,select,label")) return;
      toggleRow(row);
    });
    row.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggleRow(row);
      }
    });
  });
})();
  </script>
</div>`;
}

function renderAdminLoginContent(base, flags) {
  const failed = flags?.failed;
  const required = flags?.required;
  return `<section class="section admin-login-section">
  <div class="container container--narrow">
    <dialog id="admin-login-dialog" class="admin-login-dialog" open aria-labelledby="admin-login-title">
      <form method="post" action="${base}/login" class="admin-login-form">
        <h2 id="admin-login-title" class="admin-login-title">Admin sign-in</h2>
        <p class="admin-login-lead">Enter the username and password configured for this deployment (<code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code>).</p>
        ${
          failed
            ? '<p class="contact-flash contact-flash--error admin-login-flash" role="alert">Invalid username or password.</p>'
            : ""
        }
        ${
          required
            ? '<p class="contact-flash contact-flash--error admin-login-flash" role="alert">Please sign in to continue.</p>'
            : ""
        }
        <label for="admin-user">Username</label>
        <input id="admin-user" name="admin_username" type="text" autocomplete="username" required>
        <label for="admin-pass">Password</label>
        <input id="admin-pass" name="admin_password" type="password" autocomplete="current-password" required>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
    </dialog>
  </div>
</section>`;
}

module.exports = {
  getAdminInboxStyles,
  renderAdminInboxContent,
  renderAdminLoginContent,
};
