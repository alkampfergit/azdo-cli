#!/usr/bin/env bash
# Compute the npm publish version and dist-tag for a given branch.
#
# Usage:
#   compute-version.sh [BRANCH [RUN_NUMBER]]
#
# Arguments default to $GITHUB_REF_NAME and $GITHUB_RUN_NUMBER when omitted,
# so the script works both in CI and locally for exploration:
#
#   ./scripts/compute-version.sh develop 42
#   ./scripts/compute-version.sh 032-fix-code-generics 1
#   ./scripts/compute-version.sh release/0.14.0 5
#   ./scripts/compute-version.sh master          # requires a semver tag at HEAD
#
# Outputs (printed to stdout, one per line):
#   version=<computed version>
#   tag=<npm dist-tag>
#
# Exit codes:
#   0  success
#   1  master branch with no semver tag at HEAD

set -euo pipefail

BRANCH="${1:-${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}}"
RUN="${2:-${GITHUB_RUN_NUMBER:-0}}"

SAFE_BRANCH=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9-]/-/g')

# Latest clean semver tag across the whole repo (used by all non-master paths).
# Strips the optional 'v' prefix before sorting so that '0.13.0' and 'v0.9.0'
# sort correctly together (without normalization git places v-prefixed tags first).
latest_semver_tag() {
  git tag | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' | sed 's/^v//' | sort -V | tail -n 1
}

next_minor_base() {
  local tag
  tag=$(latest_semver_tag)
  tag="${tag#v}"
  local major minor
  major=$(echo "$tag" | cut -d. -f1)
  minor=$(echo "$tag" | cut -d. -f2)
  echo "${major}.$((minor + 1)).0"
}

if [ "$BRANCH" = "master" ]; then
  HEAD_TAG=$(git tag --points-at HEAD | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$' | head -n 1)
  if [ -z "$HEAD_TAG" ]; then
    echo "ERROR: no semver tag found at HEAD on master branch." >&2
    exit 1
  fi
  VERSION="${HEAD_TAG#v}"

  # Only promote to `latest` when this version is >= the current npm latest,
  # so a hotfix on an older minor (e.g. 0.8.1 after 0.9.0) doesn't regress it.
  CURRENT_LATEST=$(npm view azdo-cli dist-tags.latest 2>/dev/null || true)
  if [ -z "$CURRENT_LATEST" ]; then
    TAG="latest"
  else
    HIGHEST=$(printf '%s\n%s\n' "$VERSION" "$CURRENT_LATEST" | sort -V | tail -n 1)
    if [ "$HIGHEST" = "$VERSION" ]; then
      TAG="latest"
    else
      MAJOR_MINOR=$(echo "$VERSION" | cut -d. -f1,2)
      TAG="maint-${MAJOR_MINOR}"
    fi
  fi

elif [ "$BRANCH" = "develop" ]; then
  TAG="dev"
  VERSION="$(next_minor_base)-develop.${RUN}"

elif [[ "$BRANCH" == release/* ]]; then
  TAG="next"
  VERSION="$(next_minor_base)-next.${RUN}"

else
  TAG="dev"
  VERSION="$(next_minor_base)-${SAFE_BRANCH}.${RUN}"
fi

BASE_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")

echo "version=${VERSION}"
echo "tag=${TAG}"
echo "base_version=${BASE_VERSION}"
