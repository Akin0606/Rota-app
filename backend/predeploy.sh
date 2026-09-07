#!/bin/sh
# Render pre-deploy command.
#
# Runs on a separate instance after the build finishes and before any traffic
# moves to the new version. Strict on purpose: a non-zero exit here fails the
# whole deploy while the last good instance keeps serving, with zero downtime.
#
# That is the guarantee the old entrypoint-based migration could not give. There,
# migrations ran under `set -e` immediately before `exec uvicorn`, so a failure
# did not degrade the API, it deleted it — migration 027 crash-looped production
# on a transient connection blip and took `/health` down with it.
set -e

cd "$(dirname "$0")"

echo "[predeploy] applying database migrations..."
python -m scripts.migrate
echo "[predeploy] migrations complete."
