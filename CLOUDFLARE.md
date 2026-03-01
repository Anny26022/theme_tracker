# Cloudflare Deployment (Vercel-Compatible)

This project now supports Cloudflare Workers while keeping existing Vercel deployment unchanged.

## What was added

- `wrangler.toml`
- `cloudflare/worker.mjs`
- npm scripts:
  - `npm run cf:dev`
  - `npm run cf:deploy`

## Route compatibility

The Worker mirrors current Vercel behavior:

- `GET/POST /api/fuckyouuuu`
- `GET/POST /api/fckyouuu1`
- `GET/POST /api/scanx`
- `GET/POST /api/mobile-batch`
- `POST /api/mobile-strike`
- `POST /api/mobile-scanx`
- `ALL /api/tv/*` (TradingView proxy with session headers/cookies)
- Rewrite aliases:
  - `/api/v1/fuckyouuuu` -> same as `/api/fuckyouuuu`
  - `/api/v1/fckyouuu1` -> same as `/api/fckyouuu1`
  - `/api/v1/fckyouuu2` -> same as `/api/scanx`

## Frontend hosting

Worker serves built SPA assets from `dist` through Workers Assets and falls back to `/index.html` for client routes.

## Cache behavior parity

- `/data.json`: `s-maxage=54000, stale-while-revalidate=60`
- Realtime/POST endpoints: `no-store`
- TV proxy: `no-store` + `Vary: x-tv-sessionid, x-tv-sessionid-sign, Cookie`
- GET batch endpoints keep CDN cache windows equivalent to current Vercel setup.
- Worker uses explicit `caches.default` TTL+SWR for cacheable GET APIs.
- Compatibility headers are emitted for existing client metrics logic:
  - `x-vercel-cache: HIT | MISS | STALE | BYPASS`
  - `Age`

## Deploy steps

1. Authenticate once:
   - `npx wrangler login`
2. Deploy:
   - `npm run cf:deploy`
3. For local Worker dev:
   - `npm run cf:dev`
