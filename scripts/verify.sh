#!/usr/bin/env bash
# Runs the full check sequence used after every change: typecheck, unit tests, build, smoke.
set -o pipefail
cd "$(dirname "$0")/.."
pkill -f "vite preview" 2>/dev/null; sleep 1
npm run typecheck >/dev/null 2>&1 && echo "typecheck: PASS" || { echo "typecheck: FAIL"; npm run typecheck; exit 1; }
npm test 2>&1 | grep -E "Tests |FAIL|×" ; npm test >/dev/null 2>&1 || exit 1
npm run build 2>&1 | grep -E "error|built" ; npm run build >/dev/null 2>&1 || exit 1
mkdir -p test-results; LOG="${SMOKE_LOG:-test-results/smoke.log}"
timeout 900 npm run test:smoke > "$LOG" 2>&1; code=$?
echo "smoke: $(grep -cE '^PASS' "$LOG") PASS, $(grep -cE '^FAIL' "$LOG") FAIL (exit $code)"
grep -E "^FAIL|Error:" "$LOG" | head -20
exit $code
