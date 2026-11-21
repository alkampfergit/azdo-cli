// Unit tests never go through the dev container's Caddy proxy.
delete process.env.AZDO_API_BASE_URL;
