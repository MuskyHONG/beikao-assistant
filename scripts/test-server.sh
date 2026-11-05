#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
test_project="beikao-tests-$$"
cleanup() {
  status=$?
  trap - EXIT
  docker compose --env-file /dev/null -f compose.test.yaml -p "$test_project" down --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT
printf 'Running isolated tests in Compose project %s (no host ports or production volumes)\n' "$test_project"
docker compose --env-file /dev/null -f compose.test.yaml -p "$test_project" run --build --rm tests
