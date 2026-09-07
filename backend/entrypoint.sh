#!/bin/sh
set -e

cd "$(dirname "$0")"

# Migrations belong to the pre-deploy step (backend/predeploy.sh), which fails
# the deploy without ever touching the running service.
#
# What is left here is only the fallback for a service with no pre-deploy
# command configured — production is on a Render account this repo's tooling
# cannot reach, so it must keep migrating itself until someone sets that field.
# It is deliberately NOT a gate on the boot any more: a half-migrated database
# breaks the feature that needed the migration, while a dead boot breaks
# everything, and the 027 outage was the second kind.
#
# Set MIGRATE_ON_BOOT=false on any service whose pre-deploy command is wired up.
case "${MIGRATE_ON_BOOT:-fallback}" in
  false | off | 0 | no)
    echo "[entrypoint] MIGRATE_ON_BOOT=${MIGRATE_ON_BOOT} — pre-deploy owns migrations; checking only."
    python -m scripts.migrate --check \
      || echo "[entrypoint] WARNING: migrations are PENDING — the pre-deploy step did not run, or did not finish." >&2
    ;;
  *)
    echo "[entrypoint] no pre-deploy step configured; applying migrations (non-blocking)..."
    python -m scripts.migrate \
      || echo "[entrypoint] WARNING: migrations FAILED — starting the API anyway, on whatever schema is there." >&2
    ;;
esac

echo "[entrypoint] starting app..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
