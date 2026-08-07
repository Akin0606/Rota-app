#!/bin/sh
set -e

echo "[entrypoint] running database migrations..."
python -m scripts.migrate

echo "[entrypoint] starting app..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
