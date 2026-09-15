#!/usr/bin/env bash
set -euo pipefail

VAULT_NAME="${AZDO_CLI_VAULT_NAME:-alk-agent-vault}"
SECRET_NAME="${AZDO_CLI_SECRET_NAME:-azdo-cli-dotenv}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# The integration-test .env lives one directory above the repo root, outside git.
INPUT_FILE="${1:-$(dirname "$REPO_ROOT")/.env}"

if ! command -v az &>/dev/null; then
    echo "Error: Azure CLI (az) is not installed." >&2
    exit 1
fi

if [[ ! -f "$INPUT_FILE" ]]; then
    echo "Error: file '$INPUT_FILE' not found." >&2
    exit 1
fi

if [[ ! -s "$INPUT_FILE" ]]; then
    echo "Error: file '$INPUT_FILE' is empty; refusing to overwrite the secret." >&2
    exit 1
fi

if ! az account show &>/dev/null 2>&1; then
    echo "Not logged in to Azure. Running 'az login'..."
    az login --use-device-code
fi

echo "Uploading '$INPUT_FILE' to secret '$SECRET_NAME' in vault '$VAULT_NAME'..."
# --file keeps the multi-line .env intact ('--value' cannot be combined with it)
# and records a 'file-encoding=utf-8' tag on the new secret version.
az keyvault secret set \
    --vault-name "$VAULT_NAME" \
    --name "$SECRET_NAME" \
    --file "$INPUT_FILE" \
    --output none

echo "Secret '$SECRET_NAME' updated (a new version was created)."
