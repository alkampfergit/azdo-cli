#!/bin/sh
# Start Caddy. The PAT is not required to boot: until fetch-pat.sh has stored
# one, the proxy forwards an empty credential and Azure DevOps answers 401.
set -eu
mkdir -p /run/azdo
[ -f /run/azdo/proxy-auth ] || : > /run/azdo/proxy-auth
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
