# GyanGo Marketing Website

Static marketing website for **GyanGo** (package: `ai.gyango`) by Gyango.

## File structure

```text
website/
├── index.html
├── privacy-policy.html
├── terms.html
├── contact.html
├── robots.txt
├── sitemap.xml
├── favicon.svg
└── assets/
    ├── css/
    │   └── styles.css
    ├── js/
    │   └── main.js
    └── img/
        ├── gyango-logo.svg
        └── gyango-icon-placeholder.svg
```

## Preview locally

Because this is a static site, use any local static server:

- Python:
  - `cd website`
  - `python3 -m http.server 8080`
  - Open `http://localhost:8080`
- Node (optional):
  - `npx serve website`

## Deploy options

## 1) GitHub Pages

1. Push this repository to GitHub.
2. In repository settings, open **Pages**.
3. Set source to your branch/folder that contains `website/`.
4. If needed, publish from `/website` root.
5. Update canonical URLs in:
   - `index.html`, `privacy-policy.html`, `terms.html`, `contact.html` (`og:url` / `og:image`)
   - `robots.txt`
   - `sitemap.xml`

## 2) Netlify

1. Create a new site from your Git repository.
2. Build command: leave empty (not required).
3. Publish directory: `website`.
4. Deploy.
5. Update canonical URLs and sitemap/robots to your live domain.

## 3) Vercel (static hosting)

1. Import repository into Vercel.
2. Framework preset: **Other**.
3. Build command: empty.
4. Output directory: `website`.
5. Deploy and then update canonical URLs to your domain.

## Notes before production

- Replace placeholder emails if needed:
  - `support@gyango.com`
  - `privacy@gyango.com`
- Replace placeholder logo/icon files in `assets/img/` and `favicon.svg` with final brand assets.
- Set final production domain everywhere `https://www.gyango.com` appears.
