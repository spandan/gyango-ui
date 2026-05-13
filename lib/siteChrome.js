"use strict";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Shared header/footer matching public pages (root-relative URLs).
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.metaDescription]
 * @param {'home'|'contact'|'privacy'|'terms'|'admin'} opts.activeNav
 * @param {string} opts.mainHtml — inner HTML for <main id="main-content">
 * @param {string} [opts.extraHead] — additional head HTML (e.g. <style>)
 * @param {string} opts.adminHref — e.g. "/internal-sys/feedback"
 */
function renderLayout(opts) {
  const title = escapeHtml(opts.title || "GyanGo");
  const desc = escapeHtml(opts.metaDescription || "");
  const active = opts.activeNav || "home";
  const mainHtml = opts.mainHtml || "";
  const extraHead = opts.extraHead || "";
  const adminHref = opts.adminHref || "/internal-sys/feedback";

  const nav = (href, label, key) => {
    const isActive = active === key;
    return `<a href="${href}"${isActive ? ' class="active"' : ""}${isActive ? ' aria-current="page"' : ""}>${label}</a>`;
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${desc ? `<meta name="description" content="${desc}">` : ""}
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#6f8f72">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/assets/styles.css">
  ${extraHead}
  <script defer src="/assets/js/main.js"></script>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <div class="container nav-wrap">
      <a class="brand" href="/index.html" aria-label="GyanGo home">
        <img src="/assets/img/gyangoAI.webp" alt="GyanGo logo">
        <span>GyanGo</span>
      </a>
      <button
        class="menu-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="site-nav"
        aria-label="Open menu"
      >Menu</button>
      <nav id="site-nav" class="site-nav" aria-label="Main navigation">
        ${nav("/index.html", "Home", "home")}
        ${nav("/privacy-policy.html", "Privacy Policy", "privacy")}
        ${nav("/terms.html", "Terms", "terms")}
        ${nav("/contact.html", "Contact", "contact")}
        <a href="${escapeHtml(adminHref)}"${active === "admin" ? ' class="active"' : ""}${active === "admin" ? ' aria-current="page"' : ""}>Admin</a>
      </nav>
    </div>
  </header>
  <main id="main-content">${mainHtml}</main>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <strong>GyanGo</strong>
        <p class="tagline">GyanGo is a privacy-first AI guide by Gyango.</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="/index.html">Home</a>
        <a href="/privacy-policy.html">Privacy Policy</a>
        <a href="/terms.html">Terms</a>
        <a href="/contact.html">Contact</a>
        <a href="${escapeHtml(adminHref)}">Admin</a>
      </nav>
    </div>
    <div class="container">
      <p class="small copyright">© <span class="js-year"></span> Gyango. All rights reserved.</p>
    </div>
  </footer>
</body>
</html>`;
}

module.exports = { renderLayout, escapeHtml };
