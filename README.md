# Matrix Scoreboard Cloudflare Worker

This repo contains:
- Worker API: [cloudflare_worker.js](cloudflare_worker.js)
- Board firmware: [code.py](code.py)

## Required config

### KV binding
- `CONTROL_KV` (Cloudflare KV namespace binding)

### Required secrets
- `CONTROL_TOKEN`
- `SOCCER_API_TOKEN` (football-data.org)
- `OLYMPICS_API_KEY` (SportsDataIO Olympics)

### Required vars
- `SPORTS_API_URL` (ESPN base)
- `NCAA_SOFTBALL_API_URL` (Henrygd NCAA softball)
- `NCAA_BASKETBALL_API_URL` (ESPN NCAA basketball)
- `OLYMPICS_API_URL` (SportsDataIO Olympics)
- `SOCCER_API_URL` (football-data.org)
- `INDIVIDUAL_SPORTS_API_URL` (ESPN ATP tennis)
- `WELLESLEY_SOFTBALL_URL`

Defaults are already in [wrangler.toml](wrangler.toml) and [.dev.vars.example](.dev.vars.example).

## Setup and deploy

1. Install deps:
   - `npm install`

2. Copy dev vars:
   - `cp .dev.vars.example .dev.vars`

3. Create KV namespaces:
   - `npx wrangler kv namespace create CONTROL_KV`
   - `npx wrangler kv namespace create CONTROL_KV --preview`

4. Put returned IDs into [wrangler.toml](wrangler.toml) under `[[kv_namespaces]]`.

5. Set secrets:
   - `npx wrangler secret put CONTROL_TOKEN`
   - `npx wrangler secret put SOCCER_API_TOKEN`
   - `npx wrangler secret put OLYMPICS_API_KEY`

6. Run local Worker:
   - `npm run dev`

7. Deploy:
   - `npm run deploy`

## Routes

- `POST /control`
- `GET /control?device_id=<id>`
- `GET /score?device_id=<id>`
- `GET /health`

## Smoke tests

Replace `<worker-url>` with your Worker hostname.

- Health:
  - `curl -s https://<worker-url>/health`
- Get control:
  - `curl -s "https://<worker-url>/control?device_id=matrix-01"`
- Set control:
  - `curl -X POST https://<worker-url>/control -H "Authorization: Bearer $CONTROL_TOKEN" -H "Content-Type: application/json" --data '{"device_id":"matrix-01","source":"pro","sport":"nfl","team":"DAL","mode":"auto"}'`
- Get score:
  - `curl -s "https://<worker-url>/score?device_id=matrix-01"`

## Health endpoint triage

Use `/health` to see configuration and upstream reachability.

- `sports_api` fails: verify ESPN base URL and internet reachability.
- `ncaa_softball` fails: verify Henrygd endpoint availability.
- `ncaa_basketball` fails: verify ESPN NCAA endpoint.
- `soccer` fails with 401/403: verify `SOCCER_API_TOKEN` secret.
- `olympics` fails with 401/403: verify `OLYMPICS_API_KEY` secret/subscription.
- `individual` fails: verify ESPN tennis endpoint.
- `wellesley` fails: verify Wellesley URL availability.

## GitHub deploy option

Workflow file: [.github/workflows/deploy-worker.yml](.github/workflows/deploy-worker.yml)

Required repository secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
