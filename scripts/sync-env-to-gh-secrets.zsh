#!/usr/bin/env zsh

set -euo pipefail

find_env_file() {
  local dir="${1:A}"

  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/.env" ]]; then
      printf '%s\n' "$dir/.env"
      return 0
    fi
    dir="${dir:h}"
  done

  if [[ -f "/.env" ]]; then
    printf '/.env\n'
    return 0
  fi

  return 1
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

parse_env_line() {
  local line="$1"
  local key value first_char last_char

  [[ -z "${line//[[:space:]]/}" ]] && return 1
  [[ "$line" == [[:space:]]#\#* ]] && return 1

  if [[ "$line" == export[[:space:]]* ]]; then
    line="${line#export}"
    line="$(trim_whitespace "$line")"
  fi

  [[ "$line" == *=* ]] || return 1

  key="${line%%=*}"
  value="${line#*=}"
  key="$(trim_whitespace "$key")"
  value="$(trim_whitespace "$value")"

  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || return 1

  if [[ -n "$value" ]]; then
    first_char="${value[1]}"
    last_char="${value[-1]}"

    if [[ "$first_char" == "'" && "$last_char" == "'" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$first_char" == '"' && "$last_char" == '"' ]]; then
      value="${value:1:${#value}-2}"
      value="${value//\\n/$'\n'}"
      value="${value//\\r/$'\r'}"
      value="${value//\\t/$'\t'}"
      value="${value//\\\"/\"}"
      value="${value//\\\\/\\}"
    else
      value="${value%%[[:space:]]#\#*}"
      value="$(trim_whitespace "$value")"
    fi
  fi

  printf '%s\t%s\n' "$key" "$value"
}

ensure_tooling() {
  command -v gh >/dev/null 2>&1 || {
    print -u2 "error: GitHub CLI (gh) is required."
    exit 1
  }

  git rev-parse --show-toplevel >/dev/null 2>&1 || {
    print -u2 "error: run this script from inside the target git repository."
    exit 1
  }

  gh auth status >/dev/null 2>&1 || {
    print -u2 "error: gh is not authenticated."
    exit 1
  }
}

main() {
  local env_file repo key value parsed count
  local -a selected_keys

  ensure_tooling

  env_file="$(find_env_file "$PWD")" || {
    print -u2 "error: no .env file found in $PWD or its parent directories."
    exit 1
  }

  repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
  selected_keys=("$@")

  print "Using .env file: $env_file"
  print "Target repository: $repo"

  count=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    parsed="$(parse_env_line "$line")" || continue
    key="${parsed%%$'\t'*}"
    value="${parsed#*$'\t'}"

    if (( ${#selected_keys[@]} > 0 )) && [[ ${selected_keys[(Ie)$key]} -eq 0 ]]; then
      continue
    fi

    print "Setting secret: $key (length=${#value})"
    printf '%s' "$value" | gh secret set "$key" --repo "$repo"
    (( count += 1 ))
  done < "$env_file"

  if (( count == 0 )); then
    print -u2 "warning: no matching KEY=VALUE entries were found in $env_file."
    exit 1
  fi

  print "Updated $count GitHub Actions secret(s)."
}

main "$@"
