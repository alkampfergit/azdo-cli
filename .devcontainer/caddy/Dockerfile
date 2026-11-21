# Caddy proxy that also carries the Azure CLI, so the PAT can be fetched from
# Key Vault inside this container and never reaches the app container.
FROM caddy:2.10 AS caddy

FROM mcr.microsoft.com/azure-cli:2.77.0
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY entrypoint.sh fetch-pat.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/fetch-pat.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
