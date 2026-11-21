# Caddy proxy that also carries the Azure CLI, so the PAT can be fetched from
# Key Vault inside this container and never reaches the app container.
# Build context is .devcontainer/ so the trusted Caddyfile is baked into the
# image: the app container mounts the workspace read-write and must not be able
# to edit the proxy configuration that a later `caddy reload` would load.
FROM caddy:2.10 AS caddy

FROM mcr.microsoft.com/azure-cli:2.77.0
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY caddy/entrypoint.sh caddy/fetch-pat.sh /usr/local/bin/
COPY Caddyfile /etc/caddy/Caddyfile

# Run as an unprivileged user (the base image has no useradd). /run/azdo is
# pre-created and owned by it, so a new named volume mounted there inherits the
# ownership; ~/.azure is a tmpfs (see docker-compose.yml). Strip CR from the
# scripts so a Windows checkout cannot break their shebang.
RUN echo 'caddy:x:10001:10001:caddy:/home/caddy:/bin/sh' >> /etc/passwd \
    && echo 'caddy:x:10001:' >> /etc/group \
    && mkdir -p /home/caddy /run/azdo \
    && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh /usr/local/bin/fetch-pat.sh \
    && chown -R 10001:10001 /home/caddy /run/azdo \
    && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/fetch-pat.sh
USER 10001:10001
ENV HOME=/home/caddy
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
