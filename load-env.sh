#!/usr/bin/env bash

# Load variables from the .env file into the current shell.
# NOTE: This script must be *sourced*, not executed, e.g.:
#   source load-env.sh
# or
#   . ./load-env.sh

# If this script is run directly (./load-env.sh), print a warning because
# environment changes will not persist in the parent shell.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "[load-env] This script must be sourced to affect the current shell:" >&2
  echo "  source load-env.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[load-env] No .env file found at: $ENV_FILE" >&2
  return 1
fi

# Auto-export all variables defined while the script runs
set -a
source "$ENV_FILE"
set +a

echo "[load-env] Loaded environment variables from $ENV_FILE"
