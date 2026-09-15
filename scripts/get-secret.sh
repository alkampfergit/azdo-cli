#!/usr/bin/env bash
set -euo pipefail

VAULT_NAME="${AZDO_CLI_VAULT_NAME:-alk-agent-vault}"
SECRET_NAME="${AZDO_CLI_SECRET_NAME:-azdo-cli-dotenv}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# The integration-test .env lives one directory above the repo root, outside git.
OUTPUT_FILE="${1:-$(dirname "$REPO_ROOT")/.env}"

if ! command -v az &>/dev/null; then
    echo "Error: Azure CLI (az) is not installed." >&2
    exit 1
fi

if ! az account show &>/dev/null 2>&1; then
    echo "Not logged in to Azure. Running 'az login'..."
    az login --use-device-code
fi

echo "Downloading secret '$SECRET_NAME' from vault '$VAULT_NAME'..."
az keyvault secret show \
    --vault-name "$VAULT_NAME" \
    --name "$SECRET_NAME" \
    --query value \
    -o tsv > "$OUTPUT_FILE"

echo "Secret saved to $OUTPUT_FILE"
