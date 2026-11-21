# Caddy proxy that also carries the Azure CLI, so the PAT can be fetched from
# Key Vault inside this container and never reaches the app container.
FROM caddy:2.10 AS caddy

FROM mcr.microsoft.com/azure-cli:2.77.0
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY entrypoint.sh fetch-pat.sh /usr/local/bin/

# Run as an unprivileged user (the base image has no useradd). /run/azdo and
# ~/.azure are pre-created and owned by it, so new named volumes mounted there
# inherit that ownership.
RUN echo 'caddy:x:10001:10001:caddy:/home/caddy:/bin/sh' >> /etc/passwd \
    && echo 'caddy:x:10001:' >> /etc/group \
    && mkdir -p /home/caddy/.azure /run/azdo \
    && chown -R 10001:10001 /home/caddy /run/azdo \
    && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/fetch-pat.sh
USER 10001:10001
ENV HOME=/home/caddy
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
