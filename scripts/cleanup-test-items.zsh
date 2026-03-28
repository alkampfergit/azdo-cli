#!/usr/bin/env zsh
# Deletes all Azure DevOps work items whose title contains "[azdo-cli-test]".
#
# Uses the same env vars as the integration tests:
#   AZDO_PAT, AZDO_ORG, AZDO_PROJECT
#
# Loads from ../.env (one level above the repo root) if present,
# matching the integration-test convention.
#
# Usage:
#   zsh scripts/cleanup-test-items.zsh
#   zsh scripts/cleanup-test-items.zsh --dry-run   # list items without deleting

set -uo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# ── Load .env ────────────────────────────────────────────────────────────────
SCRIPT_DIR="${0:a:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
ENV_FILE="${PROJECT_ROOT:h}/.env"

if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="${line## }"
    line="${line%% }"
    [[ -z "$line" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ -n "$key" && -z "${(P)key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$ENV_FILE"
fi

PAT="${AZDO_PAT:-}"
ORG="${AZDO_ORG:-}"
PROJECT="${AZDO_PROJECT:-}"

if [[ -z "$PAT" || -z "$ORG" || -z "$PROJECT" ]]; then
  echo "ERROR: AZDO_PAT, AZDO_ORG, and AZDO_PROJECT must be set." >&2
  exit 1
fi

BASE_URL="https://dev.azure.com/${ORG}/${PROJECT}/_apis/wit"
AUTH=$(printf ":%s" "$PAT" | base64 -w0)

# ── Query work items with [azdo-cli-test] in the title ──────────────────────
WIQL="{\"query\":\"SELECT [System.Id], [System.Title] FROM workitems WHERE [System.Title] CONTAINS '[azdo-cli-test]' AND [System.TeamProject] = '${PROJECT}' ORDER BY [System.Id] ASC\"}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  "${BASE_URL}/wiql?api-version=7.1" \
  -d "$WIQL")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ne 200 ]]; then
  echo "ERROR: WIQL query failed (HTTP $HTTP_CODE):" >&2
  echo "$BODY" >&2
  exit 1
fi

IDS=("${(@f)$(echo "$BODY" | grep -oP '"id"\s*:\s*\K[0-9]+')}")

if [[ ${#IDS[@]} -eq 0 || -z "${IDS[1]}" ]]; then
  echo "No work items found with [azdo-cli-test] in the title."
  exit 0
fi

echo "Found ${#IDS[@]} work item(s) to delete."

# ── Delete each work item ────────────────────────────────────────────────────
DELETED=0
FAILED=0
for ID in "${IDS[@]}"; do
  if [[ "$DRY_RUN" == true ]]; then
    echo "  [dry-run] Would delete work item #$ID"
  else
    DEL_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X DELETE \
      -H "Authorization: Basic $AUTH" \
      "${BASE_URL}/workitems/${ID}?api-version=7.1")

    if [[ "$DEL_CODE" -eq 200 || "$DEL_CODE" -eq 204 ]]; then
      echo "  Deleted #$ID"
      DELETED=$((DELETED + 1))
    else
      echo "  WARNING: Failed to delete #$ID (HTTP $DEL_CODE)" >&2
      FAILED=$((FAILED + 1))
    fi
  fi
done

echo ""
echo "Done. Deleted: $DELETED, Failed: $FAILED"
exit 0
