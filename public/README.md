# GyanGo marketing assets (`public/`)

Static HTML, CSS, JS, and images for **GyanGo** (package: `ai.gyango`) by Gyango.

**Run the full app** (static files + `/api/feedback` + Postgres + internal admin) from the repo root — see [`README.md`](../README.md):

```bash
cd ..
npm install && npm start
```

## File structure

```text
public/
├── index.html
├── privacy-policy.html
├── terms.html
├── contact.html
├── robots.txt
├── sitemap.xml
├── favicon.svg
└── assets/
    ├── styles.css
    ├── css/
    │   └── styles.css   # re-exports ../styles.css
    ├── js/
    │   └── main.js
    └── img/
        └── …
```

## Static-only preview (no API)

If you only need HTML/CSS without the Node server:

```bash
cd public
python3 -m http.server 8080
```

Feedback **POST** will not work without the app from the repo root.
