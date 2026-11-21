#!/bin/sh
# Run inside the caddy container:
#   docker compose exec caddy fetch-pat.sh
# Reads the integration-test .env secret from Key Vault (same vault/secret as
# scripts/get-secret.sh), keeps only AZDO_PAT, stores it as the Basic
# credential Caddy injects, and reloads Caddy. The PAT is never printed.
#
# The Azure login is only needed to read the secret, so it is always removed
# when the script ends (success or failure): the token cache is a credential
# for the whole Azure account, while the PAT is limited to its own scopes.
set -eu

VAULT_NAME="${AZDO_CLI_VAULT_NAME:-alk-agent-vault}"
SECRET_NAME="${AZDO_CLI_SECRET_NAME:-azdo-cli-dotenv}"
AUTH_FILE=/run/azdo/proxy-auth

logout() {
  az logout >/dev/null 2>&1 || true
  az account clear >/dev/null 2>&1 || true
}
trap logout EXIT

if ! az account show >/dev/null 2>&1; then
  echo "Not logged in to Azure. Running 'az login'..."
  az login --use-device-code >/dev/null
fi

echo "Reading secret '$SECRET_NAME' from vault '$VAULT_NAME'..."
pat=$(az keyvault secret show --vault-name "$VAULT_NAME" --name "$SECRET_NAME" \
  --query value -o tsv | tr -d '\r' | sed -n 's/^AZDO_PAT[[:space:]]*=[[:space:]]*//p' | head -n1 \
  | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')

if [ -z "$pat" ]; then
  echo "Error: no AZDO_PAT entry in the secret." >&2
  exit 1
fi

umask 077
printf ':%s' "$pat" | base64 | tr -d '\n' > "$AUTH_FILE.tmp"
mv "$AUTH_FILE.tmp" "$AUTH_FILE"
caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "PAT stored; Caddy reloaded; Azure login removed."
