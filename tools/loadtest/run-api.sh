#!/bin/sh
# Starts the API like Render Starter: 0.5 CPU, 512 MB. $1 = speech provider (mock | openrouter with local Kokoro)
S=$(dirname "$0"); SECRET=$(cat $S/jwt-secret)
docker run -d --rm --name tts-load-api --network host --cpus=0.5 --memory=512m \
 -e NODE_ENV=production -e PORT=8124 -e DATABASE_URL=postgresql://postgres:scratch@localhost:${DB_PORT:-55432}/tts -e DATABASE_POOL_MAX=${POOL:-5} \
 -e JWT_ACCESS_SECRET=$SECRET -e JWT_REFRESH_SECRET=${SECRET}r -e JWT_PASS_RESET_SECRET=${SECRET}p \
 -e SMTP_USER=load@test.local -e SMTP_PASS=x -e SMTP_FROM=load@test.local -e SMTP_HOST=127.0.0.1 -e SMTP_PORT=1 \
 -e OPENROUTER_API_KEY=sk-loadtest-invalid -e TTS_PROVIDER=${1:-mock} -e KOKORO_URL=http://127.0.0.1:8880 -e KOKORO_MAX_IN_FLIGHT=4 \
 -e STORAGE_DRIVER=local -e STORAGE_LOCAL_DIR=/tmp/storage -e PUBLIC_URL=http://localhost:8124 -e RUN_WORKERS=true tts-backend-loadtest >/dev/null
for i in $(seq 1 40); do curl -s localhost:8124/api/v1/health >/dev/null && break; sleep 1; done
