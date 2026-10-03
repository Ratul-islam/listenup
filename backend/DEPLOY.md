# Deploying the backend

One Docker image, two roles:

| Role | Command | Where |
| --- | --- | --- |
| API | `node dist/server.js` (default) | Vercel, built from `Dockerfile.vercel` |
| Worker | `node dist/worker.js` | Any always-on container host (Railway, Render, Fly.io, a VPS), built from `Dockerfile` |

The API answers the app. The worker runs the background jobs: reading imported files, AI emotions, MP3 exports, and the daily erasure of closed accounts. Both use the same Postgres (Supabase), so the API just queues jobs and the worker picks them up. Run exactly one worker.

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
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_PASS_RESET_SECRET`
- `OPENROUTER_API_KEY` (required in production)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (required in production)
- `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `GOOGLE_CLIENT_ID` for Google sign-in
- `RUN_WORKERS`: `false` for the API, `true` for the worker

## Try the image locally

```bash
docker build -t listenup-backend .
docker run --rm --env-file .env -e NODE_ENV=production -e RUN_WORKERS=false -p 8001:8000 listenup-backend
curl localhost:8001/api/v1/health
```
