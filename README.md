# gpu-model-finder

Small demo app that serves a frontend from `public/` and a simple Node server in `server.js`.

## Prerequisites

- Node.js (recommended v14+)

## Install

Install dependencies:

```bash
npm install
```

## Run

Start the server:

```bash
node server.js
# or, if a start script is defined:
# npm start
```

Open http://localhost:3000 (or the port printed by the server).

## Project layout

- `server.js` — Node/Express server
- `public/` — frontend assets (contains `index.html` and `app.js`)
- `package.json` / `package-lock.json` — project metadata and deps

## Contributing

1. Create a branch
2. Make changes, then:

```bash
git add .
git commit -m "Describe changes"
git push
```

If you get authentication errors when pushing, prefer SSH (recommended) or create a GitHub Personal Access Token (PAT) and use the macOS credential helper.

---

If you'd like, I can add a `start` script to `package.json` and commit it for you.
