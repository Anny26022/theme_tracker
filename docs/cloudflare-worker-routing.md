# Cloudflare Standalone + Vercel Compatibility

This project now supports both modes:

1. Fully standalone Cloudflare (recommended)
2. Optional Cloudflare -> origin proxy fallback

Vercel remains independently deployable via existing `api/*` functions and `vercel.json`.

## Cloudflare standalone behavior

Worker entry: `cloudflare/worker.mjs`  
Config: `wrangler.toml`

The Worker directly implements these APIs at edge:

- `/api/fuckyouuuu` (encrypted Google batch relay)
- `/api/mobile-batch`
- `/api/fckyouuu1`
- `/api/scanx`
- `/api/mobile-scanx`
- `/api/mobile-strike`
- `/api/tv` and `/api/tv/*`

It also mirrors aliases:
- `/api/v1/fuckyouuuu` -> `/api/fuckyouuuu`
- `/api/v1/fckyouuu1` -> `/api/fckyouuu1`
- `/api/v1/fckyouuu2` -> `/api/scanx`

TradingView rewrite:
- `/api/tv/*` -> `/api/tv?tv_path=*`

SPA hosting:
- Static app served from `[assets]` binding (`dist`)
- Non-API GET 404s fall back to `/index.html`

## Deploy (Cloudflare standalone)

1. Build frontend:

```bash
npm run build
```

2. Deploy worker:

```bash
npx wrangler deploy
```

## Optional hybrid fallback

You can set `ORIGIN_BASE_URL` in `wrangler.toml` to proxy unknown routes to another origin.  
Not required for standalone mode.
