# Final Local Verification

This procedure is for verifying the existing CForge project on a Windows PC. It does not change the architecture or add application features.

## Prerequisites

- Node.js **>=20.19.0** (Node.js 22 LTS is recommended)
- npm **>=10**
- Docker Desktop with the Linux container engine running
- Git is optional unless you are cloning the repository
- WSL2 is **not required by the CForge scripts**. Docker Desktop may use its WSL2 backend depending on your Docker Desktop installation; follow Docker Desktop's own setup if it requests WSL2.

Check versions in PowerShell:

```powershell
node --version
npm --version
docker --version
docker info
```

`docker info` must succeed, not only `docker --version`.

## Generate the real lockfiles

Do this once on a machine with npm registry access. Do not hand-edit or invent the lockfiles.

```powershell
cd frontend
npm install
cd ..\backend
npm install
cd ..
```

Confirm these files now exist:

```text
frontend/package-lock.json
backend/package-lock.json
```

Then verify clean installation:

```powershell
npm ci --prefix frontend
npm ci --prefix backend
```

## Manual production build

For a local production build, use localhost values only; do not put a production domain into the repository.

```powershell
$env:VITE_SITE_URL="https://localhost:5173"
$env:VITE_API_URL="http://localhost:3001"

npm run build --prefix frontend
npm run build --prefix backend
```

The frontend build must create `frontend/dist` and the backend build must create `backend/dist`.

## Build the exact sandbox configuration

The project uses the pinned GCC 14 digest in `backend/Dockerfile.sandbox`.

```powershell
docker info
docker build --pull=false -f backend/Dockerfile.sandbox -t cforge-sandbox:gcc14-c11 backend
docker image inspect cforge-sandbox:gcc14-c11
```

`--pull=false` avoids silently replacing the pinned base image during this verification. The Dockerfile itself is the source of truth for the exact immutable base image.

## Run the backend locally

Create a local environment file once:

```powershell
Copy-Item .env.example .env
```

The supplied `.env.example` already points the local backend at:

```text
SANDBOX_IMAGE=cforge-sandbox:gcc14-c11
FRONTEND_URL=http://localhost:5173
PORT=3001
```

Start the backend:

```powershell
npm start --prefix backend
```

Keep that terminal open.

## Health endpoint

In another PowerShell window:

```powershell
Invoke-RestMethod http://localhost:3001/api/health | ConvertTo-Json
```

Expected successful shape:

```json
{"status":"ok","compilerAvailable":true}
```

## Real compiler API tests

### Hello World

```powershell
$body = @{ code = '#include <stdio.h>
int main(void) { printf("Hello World!"); return 0; }' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/run -ContentType 'application/json' -Body $body | ConvertTo-Json
```

Expected stdout:

```text
Hello World!
```

### stdin

```powershell
$body = @{ code = '#include <stdio.h>
int main(void) { int a,b; scanf("%d %d", &a, &b); printf("%d", a+b); return 0; }'; input = '10 20' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/run -ContentType 'application/json' -Body $body | ConvertTo-Json
```

Expected stdout:

```text
30
```

### Compilation error

```powershell
$body = @{ code = 'int main(void) { return 0 }' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/compile -ContentType 'application/json' -Body $body | ConvertTo-Json
```

Expected: `success` is `false` and `errorType` is `compile-error`.

### Runtime error

```powershell
$body = @{ code = '#include <stdio.h>
int main(void) { int z = 0; return 1 / z; }' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/run -ContentType 'application/json' -Body $body | ConvertTo-Json
```

Expected: `success` is `false` and `errorType` is `runtime-error`.

## Timeout, output, and sandbox security tests

The backend's existing Node test suite contains Docker-backed tests for:

- infinite-loop timeout
- bounded output
- memory abuse
- process abuse
- filesystem isolation
- network isolation
- sandbox policy
- request validation

Run them with the exact sandbox image selected:

```powershell
$env:SANDBOX_IMAGE="cforge-sandbox:gcc14-c11"
npm test --prefix backend
```

When Docker is running and the image exists, the Docker-backed tests should execute rather than being skipped.

## One-command verification script

From the repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\Verify-CForge.ps1
```

The script checks Node/npm/Docker, requires both real lockfiles, runs `npm ci`, performs both production builds, builds the pinned sandbox image, runs the backend test suite, starts the backend, and smoke-tests `/api/health`, Hello World, stdin, compile errors, and runtime errors.

If the lockfiles do not exist yet, the script stops and tells you to generate them with `npm install` first. It never creates fake lockfiles.

## Frontend production preview

After a successful frontend build:

```powershell
npm run preview --prefix frontend
```

Open the URL printed by Vite. Test `/`, `/resources`, `/docs`, and `/about`, plus the editor's Run/Compile controls against the locally running backend.

## Stop local services

If the backend is running in its own terminal, press `Ctrl+C`.

The verification script stops the temporary backend process automatically when it finishes.

The Docker sandbox containers are short-lived and use `--rm`; the backend also performs cleanup after jobs.
