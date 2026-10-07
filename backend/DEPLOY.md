# Deploying the backend

One Docker image, two roles:

| Role | Command | Where |
| --- | --- | --- |
| API | `node dist/server.js` (default) | Vercel, built from `Dockerfile.vercel` |
| Worker | `node dist/worker.js` | Any always-on container host (Railway, Render, Fly.io, a VPS), built from `Dockerfile` |

The API answers the app. The worker runs the background jobs: reading imported files, AI emotions, MP3 exports, and the daily erasure of closed accounts. Both use the same Postgres (Supabase), so the API just queues jobs and the worker picks them up. Run exactly one worker.

## Simplest: one Render Web Service

Runs the API and the jobs in one always-on container (no Vercel needed).

1. Render, then **New +**, then **Web Service**. Connect the GitHub repo, branch `main`.
2. Settings: Language **Docker**, Root Directory `backend`, Dockerfile Path `./Dockerfile`, Docker Command **empty**, Health Check Path `/api/v1/health`, Region Singapore, Instance Type **Starter** or higher (the free plan sleeps, which stops the jobs).
3. Environment: the variables below, with `NODE_ENV=production`, `RUN_WORKERS=true`, and `PUBLIC_URL=https://<service>.onrender.com`. Render sets `PORT` itself.
4. Deploy, then open `https://<service>.onrender.com/api/v1/health`. It should show `{"status":"ok"}`.
5. In `frontend/.env`: `EXPO_PUBLIC_API_URL=https://<service>.onrender.com/api/v1`.

## Before each deploy

If `prisma/migrations` changed, apply them to the production database from your machine:

```bash
pnpm db:deploy        # uses DATABASE_URL from .env
```

## API on Vercel

1. Import the repository in Vercel and set **Root Directory** to `backend`. Vercel finds `Dockerfile.vercel` and serves the API from it.
2. Add the environment variables below, with `RUN_WORKERS=false`.
3. Deploy. Check `https://<your-app>.vercel.app/api/v1/health` returns `{"status":"ok"}`.
4. In `frontend/.env`, set `EXPO_PUBLIC_API_URL=https://<your-app>.vercel.app/api/v1`.

`vercel.json` pins the region to Tokyo (`hnd1`), next to the Supabase database.

Limits that shaped the setup: request bodies over 4.5 MB are rejected, so the app uploads files straight to R2 through signed links; requests can run up to 300 seconds on the Hobby plan; instances shut down after 5 idle minutes, which is why the jobs run on the worker.

## Worker

On any host that runs a Dockerfile, build `backend/Dockerfile`, override the start command to `node dist/worker.js`, and set the environment variables with `RUN_WORKERS=true`. It needs no port or public URL.

On a VPS with Docker:

```bash
cd backend
docker compose up -d --build worker     # worker only (API on Vercel)
docker compose up -d --build            # or API on :8000 plus the worker
```

Compose reads `backend/.env`.

## Environment variables

Same as `.env.example`. For production:

- `NODE_ENV=production`
- `DATABASE_URL`: the Supabase session pooler URL; `DATABASE_POOL_MAX=3` on Vercel
- `DATABASE_POOL_MAX` (default 5) and `QUEUE_POOL_MAX` (default 3): connections per process. Supabase's session pooler allows 15 clients in all, shared by Render, local development and migrations, so one Render service (8) and one local server (8) can together hit the limit when both are busy. Raise the pool size in Supabase (Database → Settings → Connection pooling), or point local development at its own database, if you see `EMAXCONNSESSION`.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_PASS_RESET_SECRET`
- `OPENROUTER_API_KEY` (required in production)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (required in production)
- `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `GOOGLE_CLIENT_ID` for Google sign-in
- `RUN_WORKERS`: `false` for the API, `true` for the worker
- `FREE_DAILY_SPEND_CAP_USD` (default 2) and `DAILY_SPEND_CAP_USD` (default 25): daily speech spending caps, for free users together and for everyone
- `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_SECRET` for Google Play purchases. Point RevenueCat's webhook at `https://<service>/api/v1/billing/webhook` with that Authorization value
- `ADMOB_SSV` (default false): set to `true` once AdMob's rewarded-ad server-side verification calls `https://<service>/api/v1/ads/rewards/verify`. Until then the app reports rewards itself (at most 3 a day)
- `ANDROID_PACKAGE` (default `dev.ratul.tts`): used in invite links to Google Play
- The private podcast feed builds its links from `PUBLIC_URL`, so set it to the address podcast apps can reach
- `OPENROUTER_TEXT_MODEL` (default `google/gemini-3.5-flash-lite`) and `OPENROUTER_DIRECTOR_PRO_MODEL` (default `google/gemini-3.8-flash`): text AI. The second is "Make it expressive" on Pro.
- `TRUST_PROXY_HOPS` (default 1): how many proxies in front of the API add an `X-Forwarded-For` entry. Render and Vercel: 1; add one if you put Cloudflare in front. Only those entries count as the client's address, so rate limits can't be bypassed (see [LOAD-TEST.md](../LOAD-TEST.md)).
- `DATABASE_POOL_MAX=10` (recommended over the default 5, with `QUEUE_POOL_MAX=3`: 13 of the 15 connections Supabase's session pooler allows). The load test doubled throughput with it.
- **Keep the API and the database in the same region.** Render Singapore with Supabase Tokyo (about 70 ms apart) cut capacity about 10× in the load test. Use a Supabase project in Singapore (`ap-southeast-1`), or run the API in Tokyo.
- `GEMINI_API_KEY` (recommended): Google's Gemini API key, from a billed Google AI Studio project. Expressive (Gemini) voices are then made by Google directly, without OpenRouter's 5.5% fee, and background work (MP3 exports, offline downloads, podcast episodes) uses the half-price flex tier first. `GEMINI_FLEX=false` turns flex off; `GEMINI_FLEX_TIMEOUT_MS` (default 90000) is how long a flex request may wait before the part is made at the standard price. OpenRouter stays the fallback whenever Google fails.
- `KOKORO_URL` (optional): your own Kokoro-FastAPI server for Natural voices, for example `http://kokoro:8880`. If it's empty or down, OpenRouter is used. `KOKORO_MAX_IN_FLIGHT` (default 2) is how many requests it gets at once; the rest go to OpenRouter.
- Keep the OpenRouter **API key's** spending limit well above $0.50. Gemini voice requests are refused below that, and every HD voice then falls back to the phone voice.

## Try the image locally

```bash
docker build -t listenup-backend .
docker run --rm --env-file .env -e NODE_ENV=production -e RUN_WORKERS=false -p 8001:8000 listenup-backend
curl localhost:8001/api/v1/health
```
