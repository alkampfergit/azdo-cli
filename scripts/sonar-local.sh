#!/usr/bin/env bash
# Local mirror of the SonarCloud analysis: the quality-profile rules (ESLint) plus
# duplication (jscpd). Offline. See docs/sonar-local.md.
#
#   scripts/sonar-local.sh                # src/ files that differ from origin/develop
#   scripts/sonar-local.sh --base <ref>   # compare with another ref
#   scripts/sonar-local.sh --all          # every file in src/
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

BASE="origin/develop"
PATHS=(src)            # folders SonarCloud reports rule findings for
CPD_PATHS=(src)        # tests/ is in sonar.cpd.exclusions
MIN_TOKENS=80          # calibrated: 4 clones, 74 lines vs SonarCloud 4 blocks, 80 lines
CPD_THRESHOLD=3        # quality-gate limit for duplicated lines (%)
ALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --all) ALL=1 ;;
    --base) BASE="${2:?--base needs a ref}"; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

status=0

echo "== Rules (eslint.sonar.rules.json)"
if [ "$ALL" -eq 1 ]; then
  files=("${PATHS[@]}")
else
  if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
    echo "base ref '$BASE' not found; fetch it or pass --base <ref> (or --all)" >&2
    exit 2
  fi
  # Uncommitted and committed changes against the base, plus new untracked files.
  files=()
  while IFS= read -r f; do
    [ -f "$f" ] && files+=("$f")
  done < <({ git diff --name-only --diff-filter=ACMR "$BASE" -- "${PATHS[@]}"
             git ls-files --others --exclude-standard -- "${PATHS[@]}"; } | grep -E '\.ts$' | sort -u)
  if [ ${#files[@]} -eq 0 ]; then
    echo "no changed files under ${PATHS[*]} vs $BASE"
  else
    echo "${#files[@]} changed file(s) vs $BASE"
  fi
fi
if [ "$ALL" -eq 1 ] || [ ${#files[@]} -gt 0 ]; then
  npx --no-install eslint -c eslint.sonar.config.js --max-warnings=-1 "${files[@]}" || status=1
fi

echo
echo "== Duplication (jscpd, ${MIN_TOKENS} tokens, limit ${CPD_THRESHOLD}%)"
npx --no-install jscpd "${CPD_PATHS[@]}" --min-tokens "$MIN_TOKENS" --threshold "$CPD_THRESHOLD" \
  --reporters console || status=1

echo
if [ "$status" -eq 0 ]; then echo "sonar:local passed"; else echo "sonar:local FAILED"; fi
exit "$status"
