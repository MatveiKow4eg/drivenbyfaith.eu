#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/drivenbyfaith.eu}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "[deploy] Fetch latest code"
git fetch --all --prune
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "[deploy] Build and start backend service"
docker compose -f backend/docker-compose.prod.yml up -d --build backend

echo "[deploy] Apply Prisma migrations from files"
docker compose -f backend/docker-compose.prod.yml run --rm backend npx prisma migrate deploy

echo "[deploy] Ensure backend is running"
docker compose -f backend/docker-compose.prod.yml up -d backend

echo "[deploy] Done"