#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/workspaces/azdo-cli"
CRON_ENTRY="$REPO_DIR/.devcontainer/automata-do-work.cron"
RUNNER="$REPO_DIR/.devcontainer/run-do-work-cron.sh"

if [[ ! -x /usr/sbin/cron ]]; then
    sudo apt-get update
    sudo apt-get install -y cron
fi

sudo install -m 0755 "$RUNNER" /usr/local/bin/automata-do-work-cron
sudo install -m 0644 "$CRON_ENTRY" /etc/cron.d/automata-do-work
mkdir -p "$HOME/.local/state/automata-do-work"
chmod 700 "$HOME/.local/state/automata-do-work"

if ! pgrep -x cron >/dev/null 2>&1; then
    sudo /usr/sbin/cron
fi

printf 'cron installed and running; entry: /etc/cron.d/automata-do-work\n'
