# Example production deployment

This directory contains example infrastructure configuration. Replace `/opt/cforge`, usernames, and domains with your actual deployment values.

## Recommended topology

```text
Internet
  |
  +--> ${FRONTEND_DOMAIN} --> static frontend
  |
  +--> ${API_DOMAIN} --> Caddy --> Node API --> private Docker daemon --> sandbox container
```

Keep the compiler VM private. Do not expose Docker's TCP API or Unix socket to the internet.

## Backend host outline

1. Install Node.js and Docker Engine on a dedicated Linux VM.
2. Create a locked-down `cforge` service user with the minimum Docker permissions required by your operational model.
3. Copy the repository to `/opt/cforge`.
4. Build the sandbox image:

```bash
docker build -f /opt/cforge/backend/Dockerfile.sandbox -t cforge-sandbox:gcc14-c11 /opt/cforge/backend
```

5. Install dependencies and build the backend:

```bash
cd /opt/cforge/backend
npm install
npm run build
```

6. Put production variables in `/opt/cforge/.env` with mode `0600`.
7. Install `cforge-backend.service` and enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cforge-backend
```

8. Verify locally:

```bash
curl http://127.0.0.1:3001/api/health
```

## Reverse proxy / HTTPS

Install Caddy or another trusted TLS reverse proxy. Use the example Caddyfile, replace the domains, and point DNS A/AAAA records at the public reverse-proxy host. Caddy can obtain and renew certificates automatically when DNS and firewall configuration are correct.

The API process should listen only on the private host interface/firewall path; public clients should reach it through the TLS proxy.

## Frontend

Build with:

```bash
cd /opt/cforge/frontend
npm install
npm run build
```

Publish `frontend/dist` through a static host/CDN. Set `VITE_API_URL` before the build to the public HTTPS API origin.

For hosts that need explicit SPA rewrites, use the included `public/_redirects` where supported.
