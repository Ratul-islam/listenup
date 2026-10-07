#!/bin/sh
# Runs every load-test phase against the API started by run-api.sh; see LOAD-TEST.md at the repo root.
S=$(cd "$(dirname "$0")" && pwd); cd "$S"
rm -f results.jsonl stats.log phases.log
(while docker ps --format '{{.Names}}' | grep -q tts-load-api; do echo "$(date +%s) $(docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' tts-load-api)" >> stats.log; sleep 2; done) &
for phase in setup warm stress spike big login ratelimit; do
  echo "=== $phase $(date +%T)"; echo "$(date +%s) phase $phase" >> phases.log
  node load.mjs $phase 2>&1 | tail -12
  sleep 5
done
node tables.mjs
