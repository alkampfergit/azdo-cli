#!/usr/bin/env bash
set -u -o pipefail

cd /workspaces/azdo-cli || exit 1

# Run through a login shell so PATH additions from postcreate (npm globals,
# ~/.local/bin, brew) are available to the tick.
if [[ -x /usr/bin/zsh ]]; then
    exec /usr/bin/zsh -lic 'exec automata do-work --silent'
fi

exec /bin/bash -lc 'exec automata do-work --silent'
