#!/usr/bin/env sh
# Verifies that k6 thresholds actually fail a run (#2212).
#
# Runs the smoke test with an impossible latency budget (p95 < 0ms) for a few
# seconds. k6 must exit non-zero (99 = thresholds breached); if it exits 0 the
# thresholds are not being enforced and this script fails.
set -u

cd "$(dirname "$0")"

K6_P95_MS=0 SMOKE_DURATION="${SMOKE_DURATION:-5s}" SMOKE_VUS=1 \
  k6 run --quiet smoke-test.js
status=$?

if [ "$status" -eq 0 ]; then
  echo "FAIL: k6 exited 0 although the p(95)<0ms threshold must be breached" >&2
  exit 1
fi

echo "OK: breached threshold failed the k6 run (exit code $status)"
