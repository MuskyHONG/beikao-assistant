#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The source is the synthetic stack provisioned by the CI browser tests.
source_stack=(docker compose --env-file /dev/null -p beikao-ci)
target_stack=(docker compose --env-file /dev/null -p "beikao-ci-restore-$$")
source_origin=http://127.0.0.1:43128
target_origin=http://127.0.0.1:43129
dump=$(mktemp)
cleanup() {
  status=$?
  trap - EXIT
  if (( status != 0 )); then "${target_stack[@]}" logs --tail 80 || true; fi
  "${target_stack[@]}" down -v --remove-orphans || true
  rm -f -- "$dump"
  exit "$status"
}
trap cleanup EXIT

"${source_stack[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$dump"
test -s "$dump"

export HTTP_PORT=43129 APP_ORIGIN="$target_origin"
"${target_stack[@]}" up -d --wait --wait-timeout 90 db
"${target_stack[@]}" exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner' < "$dump"
"${target_stack[@]}" up -d --build --wait --wait-timeout 120
node scripts/verify-restored-exams.mjs "$source_origin" "$target_origin"
