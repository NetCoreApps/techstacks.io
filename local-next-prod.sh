#!/usr/bin/env bash
set -euo pipefail

# Run .NET backend and Next.js production build locally, with .NET proxying all web traffic.
# Usage:
#   chmod +x ./local-next-prod.sh
#   ./local-next-prod.sh

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
API_URL="http://localhost:8080"

echo "[local-next-prod] Using repo root: $ROOT_DIR"
echo "[local-next-prod] Backend URL: $API_URL"

echo "[local-next-prod] Starting .NET backend..."
(
  cd "$ROOT_DIR/TechStacks"
  ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-Development}" \
  ASPNETCORE_URLS="$API_URL" \
  dotnet run --project TechStacks.csproj
) &
DOTNET_PID=$!
echo "[local-next-prod] .NET backend PID: $DOTNET_PID"

cleanup() {
  echo "[local-next-prod] Stopping .NET backend (pid=$DOTNET_PID)..."
  kill "$DOTNET_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for backend to be ready
echo "[local-next-prod] Waiting for backend to become ready at $API_URL..."
for i in {1..30}; do
  if curl -sf "$API_URL/metadata" > /dev/null 2>&1; then
    echo "[local-next-prod] Backend is up."
    break
  fi
  sleep 1
  echo "[local-next-prod] Still waiting ($i)..."
done

if ! curl -sf "$API_URL/metadata" > /dev/null 2>&1; then
  echo "[local-next-prod] ERROR: Backend did not start in time at $API_URL" >&2
  exit 1
fi

# Build Next.js in production mode
echo "[local-next-prod] Building Next.js (production)..."
(
  cd "$ROOT_DIR/TechStacks.Client"
  NODE_ENV=production \
  INTERNAL_API_URL="$API_URL" \
  ASPNETCORE_URLS="$API_URL" \
  npm run build:prod
)

echo "[local-next-prod] Starting Next.js (production) on http://localhost:3000 ..."
cd "$ROOT_DIR/TechStacks.Client"
NODE_ENV=production \
INTERNAL_API_URL="$API_URL" \
ASPNETCORE_URLS="$API_URL" \
npm run start

