#!/bin/bash
# Runs on the HOST (not a sandboxed container, unlike other tasks in this
# benchmark) because it needs real process-tree control over the dev-server --
# see ../environment/README.md. This is the one task in the suite where the
# driver's job IS the fault injection, not just the trigger call.
set -euo pipefail

API_URL="${TRIGGER_API_URL:-http://localhost:8030}"
AUTH="Authorization: Bearer ${TRIGGER_SECRET_KEY}"

RID=$(curl -sS -X POST "$API_URL/api/v1/tasks/eval-27-long-sleep-for-crash-test/trigger" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"payload":{"sleepMs":30000}}' | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")

echo "triggered run=$RID"
sleep 3

STATUS=$(curl -sS "$API_URL/api/v3/runs/$RID" -H "$AUTH" | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])")
echo "status before kill: $STATUS"
if [ "$STATUS" != "EXECUTING" ]; then
  echo "run did not reach EXECUTING in time -- aborting driver" >&2
  exit 1
fi

KILL_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CLI_PID=$(pgrep -f "trigger.dev@latest dev" | head -1 || true)
WATCHDOG_PID=$(pgrep -f "devWatchdog.js" | head -1 || true)
kill -9 $CLI_PID $WATCHDOG_PID 2>/dev/null || true

mkdir -p /logs/driver
cat > /logs/driver/crash_result.json <<EOF
{"runId": "$RID", "killTime": "$KILL_TIME"}
EOF
echo "killed worker tree at $KILL_TIME, driver run recorded for run=$RID"
