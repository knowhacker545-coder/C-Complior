# CForge — Free Online C Compiler

CForge is a public, free online C learning and compilation workspace. It lets visitors write C code in Monaco, compile it with a real Clang/LLVM toolchain compiled to WebAssembly, run programs with stdin, inspect compiler/runtime output, and explore a library of working C examples.

CForge requires no login, signup, or account.

> **Production note:** Normal C compilation and execution are browser-local. The legacy backend/Docker compiler is not required by the public Vercel frontend.

## Features

- Monaco-based C editor
- C11 syntax highlighting and editor tooling
- Real Clang/LLVM compilation and WebAssembly execution
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

Normal compilation and execution are browser-local:

```text
Vercel
  ↓
CForge Frontend
  ↓
Web Worker
  ↓
YoWASP Clang/LLVM compiled to WebAssembly
  ↓
WASI virtual filesystem / runtime
  ↓
stdout / stderr / exit status
```

The Node.js/Express + Docker backend is no longer required for normal compiler operations. It may remain in the repository for legacy/future server-side use, but the public frontend does not call `/api/run` or `/api/compile` for normal Run/Compile actions.

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

- YoWASP `@yowasp/clang` `22.0.0-git20542-10`
- LLVM/Clang 22 WebAssembly/WASI toolchain
- `@bjorn3/browser_wasi_shim` 0.4.2 for browser-side WASI
- C11 (`-std=c11`)

YoWASP Clang is a real Clang/LLVM toolchain compiled to WebAssembly and capable of compiling C code in the browser. It produces a `wasm32-unknown-wasip1` executable that is then executed through a browser WASI shim. citeturn4search1turn4search5

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
- A modern browser with WebAssembly and Web Workers support

Docker is not required for the public frontend compiler path.

Install project dependencies:

```bash
npm run install:all
```

For the frontend, set `VITE_SITE_URL` in the Vercel project or local shell. No compiler API URL is required for normal Run/Compile operations.

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

The production frontend build requires a real `VITE_SITE_URL`; this is public build-time configuration, not a secret. `VITE_API_URL` is not required for normal browser compilation.

## Compiler

The browser compiler uses real Clang/LLVM 22 through YoWASP. Source is compiled with `-std=c11` into a WebAssembly/WASI program and executed locally in a Worker. The toolchain is not a native GCC environment, so diagnostics, ABI details, filesystem behavior, and platform-specific functionality can differ from Linux GCC. citeturn4search1turn9search6

### Supported standard library

C standard-library support comes from the WASI libc/sysroot bundled with the Clang toolchain. Common educational programs using `stdio.h`, `stdlib.h`, `string.h`, `ctype.h`, and math functions should be verified against the actual browser build before being promised as supported. Native OS headers and APIs are not part of the browser environment.

### Runtime limits

- Worker timeout: 10 seconds
- Output limit: 1 MB
- WebAssembly linear-memory target: 256 MB maximum where supported by the generated module
- Virtual/in-memory filesystem only
- No arbitrary browser network access from the C program

The limits above are browser/WASM controls and are not equivalent to Linux cgroups or Docker limits.

## Legacy backend / sandbox

`backend/` and `backend/Dockerfile.sandbox` are retained as legacy server-side infrastructure. They are **not used by the normal browser compiler path**. The frontend does not require Docker, a Docker socket, Render, or another compiler server to compile and run ordinary C programs.

For browser execution, the WASI shim exposes only the virtual resources explicitly configured by CForge. The real user filesystem, backend private services, and application secrets are not mounted into the C program.



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

### Vercel frontend

Set the Vercel project root to `frontend/` and use the standard Vite commands:

```text
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

Set the public frontend URL at build time:

```text
VITE_SITE_URL=https://your-real-domain.example
```

For local build verification only, a placeholder is acceptable:

```powershell
$env:VITE_SITE_URL="https://example.com"
npm ci
npm run build
```

Do not add `VITE_API_URL` just to make the browser compiler work; normal Compile/Run operations do not call the legacy backend.

Vercel serves static `.wasm` assets with the appropriate WebAssembly MIME type when they are emitted as build assets. `frontend/vercel.json` also declares an explicit `application/wasm` header and long-lived caching for emitted `.wasm` files.

### Browser compiler loading

The Clang toolchain is loaded lazily by the Worker. The YoWASP package is a real LLVM/Clang toolchain compiled to WebAssembly; its runtime fetches the toolchain resources when first initialized. This is a large download compared with the application shell, so the initial page should remain usable while the compiler loads. citeturn4search1turn4search5

### Legacy backend

The existing Node.js/Express backend and `backend/Dockerfile.sandbox` can remain available for development or future server-side features, but they are not part of the public Vercel compiler flow. No Render, Railway, Oracle VM, VPS, host Docker daemon, or Docker-in-Docker service is required for normal browser compilation.

## PWA and offline behavior

CForge provides a small service-worker-backed application shell and manifest. Cached UI pages may remain available without a network connection. The compiler toolchain itself is fetched and cached lazily by the browser runtime; after the compiler assets have been cached, ordinary compilation can continue without the legacy backend. A first-time compiler initialization still requires the toolchain assets to be reachable.

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
