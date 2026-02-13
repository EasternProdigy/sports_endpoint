# Matrix Scoreboard Cloudflare Worker

This repo contains your Worker API (`cloudflare_worker.js`) and board firmware (`code.py`) for the MatrixPortal M4 scoreboard.

## 1) Local setup

1. Install dependencies:
   - `npm install`
2. Copy `.dev.vars.example` -> `.dev.vars`
3. Fill `CONTROL_TOKEN` and any API URLs.
4. Update KV IDs in `wrangler.toml`.

## 2) Create KV namespace

Create namespaces and put IDs into `wrangler.toml`:

- `wrangler kv namespace create CONTROL_KV`
- `wrangler kv namespace create CONTROL_KV --preview`

## 3) Set secrets

Set secret token used by `POST /control`:

- `wrangler secret put CONTROL_TOKEN`

## 4) Run locally

- `npm run dev`

## 5) Deploy

- `npm run deploy`

Worker routes:
- `POST /control`
- `GET /control?device_id=<id>`
- `GET /score?device_id=<id>`

## 6) GitHub

Push this folder to a GitHub repo, then either:

### Option A: Deploy from local machine
Use `npm run deploy` after pull/update.

### Option B: Deploy from GitHub Actions
Add repo secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Then use the included workflow in `.github/workflows/deploy-worker.yml`.
