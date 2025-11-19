#!/usr/bin/env bash
set -e

ASPNETCORE_URLS="${ASPNETCORE_URLS:-http://0.0.0.0:8080}"
NEXT_PORT="${NEXT_PORT:-3000}"

echo "Starting ASP.NET Core on ${ASPNETCORE_URLS}..."
DOTNET_ENV_VARS=("ASPNETCORE_URLS=${ASPNETCORE_URLS}")

# Start ASP.NET Core application
ASPNETCORE_URLS="${ASPNETCORE_URLS}" dotnet /app/api/TechStacks.dll &
DOTNET_PID=$!

echo "Starting Next.js on port ${NEXT_PORT}..."
cd /app/client
npm run start -- --port "${NEXT_PORT}" &
NEXT_PID=$!

term_handler() {
  echo "Stopping processes..."
  if kill -0 "${DOTNET_PID}" 2>/dev/null; then
    kill -TERM "${DOTNET_PID}" 2>/dev/null || true
  fi
  if kill -0 "${NEXT_PID}" 2>/dev/null; then
    kill -TERM "${NEXT_PID}" 2>/dev/null || true
  fi
  wait || true
  exit 0
}

trap term_handler SIGINT SIGTERM

# Wait for the first process to exit
wait -n "${DOTNET_PID}" "${NEXT_PID}"
EXIT_CODE=$?

echo "One of the processes exited with code ${EXIT_CODE}, shutting down the other..."
term_handler

