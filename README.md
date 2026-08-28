# CForge — Free Online C Compiler

CForge is a public, free online C learning and compilation workspace. It lets visitors write C code in Monaco, compile it with a real GCC toolchain, run programs with stdin, inspect compiler/runtime output, and explore a library of working C examples.

CForge requires no login, signup, or account.

> **Production note:** CForge executes arbitrary C code. The backend must run on infrastructure where Docker sandboxing is available and correctly configured. Do not expose compiler containers or the Docker socket to the public internet.

## Features

- Monaco-based C editor
- C11 syntax highlighting and editor tooling
- Real GCC compilation and execution
- Program stdin support
- Compiler/runtime output, exit code, and execution time
- Monaco compiler-error markers
- 60 working C resources
- Search, category/difficulty filters, favorites, and recent resources
- Beginner-friendly documentation
- Dark, light, and system themes
- Persistent editor settings and local autosave
- Responsive desktop/mobile interface
- PWA shell for limited offline UI access
- No authentication or database requirement

## Architecture

Recommended public architecture:

```text
https://${FRONTEND_DOMAIN}
        |
        v
   Frontend (static)
        |
        | HTTPS / JSON
        v
https://${API_DOMAIN}
        |
        v
  Node.js + Express
        |
        | local Docker CLI / daemon access
        v
 Dedicated compiler host
        |
        v
 Fresh restricted container per job
        |
        +--> GCC 14 / C11
```

The compiler host is private. The public frontend talks to the API over HTTPS. The API starts short-lived sandbox containers. The sandbox containers themselves have no network access and no host filesystem mounts.

For a hardened deployment, put the API and Docker daemon on a dedicated VM/host and keep the Docker control plane off the public network. Do not mount `/var/run/docker.sock` into an internet-facing application container.

## Technology stack

### Frontend

- React
- TypeScript
- Vite
- Monaco Editor
- React Router

### Backend

- Node.js
- TypeScript
- Express
- CORS
- Configurable anonymous rate limiting and concurrent compiler-job cap

### Compiler infrastructure

- Docker
- GCC 14
- C11 (`-std=c11`)

## Project structure

```text
cforge/
├── frontend/
│   ├── public/
│   │   ├── icons/
│   │   ├── manifest.webmanifest
│   │   ├── robots.txt
│   │   ├── sitemap.xml
│   │   └── sw.js
│   └── src/
│       ├── components/
│       ├── data/
│       ├── pages/
│       └── styles/
├── backend/
│   ├── src/
│   │   ├── compiler/
│   │   ├── app.ts
│   │   └── server.ts
│   └── Dockerfile.sandbox
├── docs/
│   └── SECURITY.md
├── .env.example
├── frontend/.env.development.example
├── frontend/.env.production.example
├── package.json
└── README.md
```

## Installation

Requirements:

- Node.js 22.12+ recommended
- npm
- Docker Engine on the private compiler host

Install project dependencies:

```bash
npm run install:all
```

Build the sandbox image on the compiler host:

```bash
docker build -f backend/Dockerfile.sandbox -t cforge-sandbox:gcc14-c11 backend
```

Create the backend environment from `.env.example` and keep real environment files out of Git.

For the frontend, copy `frontend/.env.development.example` to `frontend/.env.development` for local development, or `frontend/.env.production.example` to `frontend/.env.production` for a production build.

## Clean installation and lockfiles

The repository pins direct dependency versions in each `package.json`. Generate and commit `frontend/package-lock.json` and `backend/package-lock.json` with `npm install --package-lock-only` on a network-enabled build machine, then use `npm ci` in CI/CD. This audit environment could not complete that network operation, so it does not claim those lockfiles were regenerated here.

## Development

### Frontend

```bash
cd frontend
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

### Backend

```bash
cd backend
npm run dev
```

Default API URL:

```text
http://localhost:3001
```

The backend needs the sandbox image and Docker daemon available.

## Production

Build the frontend:

```bash
cd frontend
npm run build
```

Build the backend:

```bash
cd backend
npm run build
```

Start the backend:

```bash
cd backend
npm start
```

Serve `frontend/dist` from a static web host/CDN. Run the backend as a long-lived service on the private compiler host behind an HTTPS reverse proxy.

Do not run arbitrary C programs directly on the frontend host. The production frontend build requires a real `VITE_SITE_URL` and `VITE_API_URL`; these are build-time configuration values, not secrets.

## Compiler

CForge uses real GCC inside a Docker sandbox. Compilation uses:

```text
gcc /workspace/main.c -std=c11 -O0 -Wall -Wextra -o /workspace/main
```

Programs are not simulated. Successful runs execute the resulting binary inside the restricted container.

### C standard

The current compiler target is **C11** using GCC's `-std=c11` option. The GCC image should be promoted from a verified immutable image/digest in production rather than relying indefinitely on a mutable base tag.

## Sandbox

Every compile/run request is assigned a fresh container. The current configuration includes:

- `--network=none`
- read-only container root filesystem
- writable ephemeral tmpfs only for `/workspace` and `/tmp`
- non-root `cforge` user (UID 10001)
- all Linux capabilities dropped
- `no-new-privileges`
- CPU limit: 1.0 CPU by default
- memory limit: 256 MB by default
- PID limit: 64 by default
- execution timeout: 10 seconds by default
- compilation timeout: 10 seconds by default
- output limit: 1 MiB by default
- input limit: 64 KiB by default
- source limit: 256 KiB by default
- open-file and file-size ulimits
- Docker `--rm` plus host-side cleanup

These values are configurable through environment variables.

## Security

Public arbitrary-code execution is high risk. The sandbox reduces the attack surface but cannot guarantee safety against every future Docker, Linux kernel, compiler, or host vulnerability.

Production recommendations:

1. Use a dedicated compiler VM/host.
2. Keep the Docker daemon private.
3. Never expose Docker's API/socket to users.
4. Keep the sandbox image minimal and patched.
5. Use HTTPS for the public API.
6. Use a trusted reverse proxy and configure `TRUST_PROXY` only when appropriate.
7. Monitor CPU, memory, process count, disk, and API traffic.
8. Keep compiler and container images updated.
9. Treat the sandbox host as security-sensitive infrastructure.
10. Do not put secrets in the sandbox environment.

See `docs/SECURITY.md` for the sandbox controls and deployment notes.

## API

### Health

```http
GET /api/health
```

Returns a small service-health response.

### Compile

```http
POST /api/compile
Content-Type: application/json
```

Body:

```json
{"code":"#include <stdio.h>\nint main(void){ puts(\"Hello\"); }"}
```

Compilation occurs without executing the resulting program.

### Run

```http
POST /api/run
Content-Type: application/json
```

Body:

```json
{"code":"#include <stdio.h>\nint main(void){ int n; scanf(\"%d\", &n); printf(\"%d\\n\", n * 2); }","input":"21\n"}
```

Responses contain structured fields including `success`, `stdout`, `stderr`, `exitCode`, `executionTime`, and error state information when applicable.

## Resource Library

CForge includes **60 working C programs** across:

- Beginner
- Games
- Arrays & Strings
- Intermediate

Each resource contains actual C source code and can be opened directly in Monaco.

## Deployment

### 1. Frontend deployment

Build the frontend and publish `frontend/dist` with a static hosting provider or CDN.

Set:

```text
VITE_API_URL=https://${API_DOMAIN}
```

This value is public configuration, not a secret.

Configure SPA fallback so `/`, `/resources`, `/docs`, and `/about` resolve to the frontend entry point.

### 2. Backend deployment

Use a Linux VM/host with Docker Engine installed. Copy the backend source, install dependencies, build TypeScript, configure the environment, and run the Node service behind a reverse proxy.

Example:

```bash
cd backend
npm install
npm run build
NODE_ENV=production npm start
```

### 3. Compiler infrastructure

Build the sandbox image:

```bash
docker build -f backend/Dockerfile.sandbox -t cforge-sandbox:gcc14-c11 backend
```

Verify it exists:

```bash
docker image inspect cforge-sandbox:gcc14-c11
```

The public internet should never connect directly to this image/container. The backend is the only service that starts sandbox jobs.

### 4. Docker setup

The backend requires permission to invoke Docker. For a hardened deployment, use a dedicated compiler host rather than giving an internet-facing application unrestricted Docker daemon access.

The sandbox containers themselves do not receive the Docker socket, host mounts, network connectivity, or elevated Linux capabilities.

### 5. Environment variables

Backend:

```text
PORT=3001
FRONTEND_URL=https://${FRONTEND_DOMAIN}
NODE_ENV=production
SANDBOX_IMAGE=cforge-sandbox:gcc14-c11
MAX_CODE_SIZE=262144
MAX_INPUT_SIZE=65536
MAX_OUTPUT_SIZE=1048576
MAX_REQUEST_BODY_SIZE=384kb
TIMEOUT_SECONDS=10
COMPILE_TIMEOUT_SECONDS=10
SANDBOX_MEMORY=256m
SANDBOX_CPUS=1.0
SANDBOX_PIDS_LIMIT=64
SANDBOX_TMPFS_SIZE=32m
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=30
TRUST_PROXY=false
```

Frontend build-time variable:

```text
VITE_API_URL=https://${API_DOMAIN}
```

Never place passwords, private keys, Docker credentials, or other secrets in frontend environment variables.

### 6. HTTPS

Terminate TLS at a trusted reverse proxy/load balancer and forward only the API traffic to the private Node process.

Use HTTPS for both:

```text
https://${FRONTEND_DOMAIN}
https://${API_DOMAIN}
```

### 7. Custom domain

Recommended DNS/application layout:

```text
${FRONTEND_DOMAIN}      -> frontend static hosting
${API_DOMAIN}  -> HTTPS reverse proxy -> private CForge backend
```

Replace `${FRONTEND_DOMAIN}` with your actual registered domain before production. The example domain is intentionally documentation-only.

### 8. API configuration

Build the frontend with:

```text
VITE_API_URL=https://api.your-domain.example
```

Set the backend's:

```text
FRONTEND_URL=https://your-domain.example
```

The API CORS policy permits only the configured frontend origin.

## PWA and offline behavior

CForge provides a small service-worker-backed application shell and manifest. Cached UI pages may remain available without a network connection, but **C compilation and execution are not offline features**.

When the browser is offline, the compiler UI reports:

> You're offline. The compiler server cannot be reached.

## Final Local Verification

Use a Windows PC with Node.js >=20.19.0, npm >=10, and Docker Desktop running. Generate the two real lockfiles with `npm install` on a network-enabled machine, then use `npm ci` for clean installs. Never hand-create or fabricate lockfiles.

The complete Windows procedure is documented in `docs/FINAL_LOCAL_VERIFICATION.md`. A PowerShell helper is available at `scripts/Verify-CForge.ps1`.

Quick start after generating the lockfiles:

```powershell
cd frontend
npm install
cd ..\backend
npm install
cd ..
npm ci --prefix frontend
npm ci --prefix backend

$env:VITE_SITE_URL="https://localhost:5173"
$env:VITE_API_URL="http://localhost:3001"
npm run build --prefix frontend
npm run build --prefix backend

docker info
docker build --pull=false -f backend/Dockerfile.sandbox -t cforge-sandbox:gcc14-c11 backend

$env:SANDBOX_IMAGE="cforge-sandbox:gcc14-c11"
npm test --prefix backend

Set-ExecutionPolicy -Scope Process Bypass
.\scripts\Verify-CForge.ps1 -SkipBuilds
```

The frontend build commands above use `https://localhost:5173` only as a local build-time canonical URL; replace build-time environment values with the real deployment values only during deployment. The project does not hardcode a production domain.

## Troubleshooting

### Compiler server unavailable

Check:

```bash
curl https://api.your-domain.example/api/health
```

Then verify Docker and the sandbox image on the compiler host.

### Sandbox unavailable

Check:

```bash
docker version
docker image inspect cforge-sandbox:gcc14-c11
```

### CORS error

Confirm `FRONTEND_URL` exactly matches the public frontend origin, including HTTPS and without an unexpected trailing path.

### Frontend routes return 404 after refresh

Configure the static host/reverse proxy to fall back unknown frontend routes to `index.html`.

### Programs time out

Check the configured `TIMEOUT_SECONDS` and remember that CPU/memory/PID limits intentionally restrict arbitrary programs.

## Limitations

- Public execution is bounded by configured resource limits.
- C programs cannot rely on internet/network access.
- Programs cannot access the backend host filesystem.
- The compiler service requires Docker and therefore does not work as a purely static/offline application.
- PWA caching does not provide offline compilation.
- In-memory IP rate limiting is local to one backend process and is not a distributed rate limiter. A multi-instance deployment should add an external rate-limit store at the infrastructure layer.
- Docker/container isolation is a defense-in-depth boundary, not an absolute guarantee against kernel/container-runtime vulnerabilities.
- The current resource library contains 60 examples.
- No user accounts, cloud project storage, or server-side code persistence are provided.
- Free hosting providers may prohibit Docker-in-Docker, long-running processes, or arbitrary code execution. Do not assume a free tier can safely or legally host the compiler backend.
- CForge does not promise unlimited free execution.

## License

MIT License. See `LICENSE`.

## Dependency-lock status

This source package intentionally does not include a fabricated lockfile. The audit environment could not reach the npm registry, so a complete `npm install`/`npm ci` dependency resolution was not possible. Before public deployment, generate and commit the two real lockfiles with a network-enabled build machine:

```bash
npm install --prefix frontend
npm install --prefix backend
```

Then use clean `npm ci --prefix frontend` and `npm ci --prefix backend` in CI/CD and retain the generated `frontend/package-lock.json` and `backend/package-lock.json` under version control.
