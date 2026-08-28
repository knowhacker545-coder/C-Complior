# CForge Final Production Audit

Date: 2026-08-28

## Status

**Needs Changes Before Public Deployment**

The application source has been audited and hardened, but this environment could not install npm dependencies or run Docker. A public deployment should not be declared production-ready until the clean npm builds and Docker sandbox tests below are executed on the target build/compiler hosts.

## Findings and fixes

### Critical / high

- Found production dependencies specified as `latest`; pinned direct dependencies to explicit versions.
- Found stale/incomplete root lockfile; removed it rather than pretending it locked the application. Real frontend/backend lockfiles must be generated with a network-enabled `npm install` and committed.
- Found frontend Settings controls that were not shared with the Monaco editor; wired them through LocalStorage and a settings-change event.
- Found a React render-time temporal-dead-zone bug in `HomePage` caused by referencing `clearMarkers` before its declaration in a hook dependency array; moved the callback before the effect.
- Added compiler-job concurrency limiting.
- Added backend request-abort propagation so client cancellation can terminate a sandbox job.
- Added explicit Docker default seccomp selection, non-root UID, private IPC, network isolation, read-only root filesystem, dropped capabilities, and no-new-privileges.
- Added compiler-aware health status without exposing infrastructure details.
- Made production frontend API configuration fail closed instead of silently falling back to localhost.
- Replaced hard-coded SEO domain values with build-time `VITE_SITE_URL` configuration and generated sitemap/robots files.

### Medium / low

- Added production security headers to the example Caddy configuration.
- Added deployment/security audit documentation.
- Kept the PWA service worker away from `/api/` requests so compiler responses are not cached.

## Tests

| Test | Result |
|---|---|
| TypeScript/TSX syntax transpilation check | PASS |
| Package JSON parsing | PASS |
| SEO generation with test HTTPS origin | PASS |
| Secret-pattern repository scan | PASS |
| `latest` dependency scan | PASS |
| `cforge.example` placeholder scan | PASS |
| GCC version check | PASS |
| Safe GCC stdin arithmetic smoke test on host GCC | PASS |
| 60 Resource Library programs, GCC C11 syntax-only compile | PASS (60/60) |
| Docker sandbox runtime tests | NOT TESTED — Docker unavailable |
| Real `/api/health` HTTP test | NOT TESTED — npm dependencies unavailable |
| Real `/api/compile` HTTP test | NOT TESTED — npm dependencies unavailable |
| Real `/api/run` HTTP test | NOT TESTED — npm dependencies unavailable |
| Frontend production build | FAIL in this environment — dependencies unavailable |
| Backend production build | FAIL in this environment — dependencies unavailable |
| Browser console test | NOT TESTED |
| Real 360–1920px browser layout test | NOT TESTED |
| Clean npm lockfile generation | NOT TESTED — npm registry access timed out |
| Docker clean build | NOT TESTED — Docker unavailable |

## Sandbox policy verified statically

- non-root UID 10001
- `--network=none`
- no host bind mounts
- no Docker socket mount
- read-only root filesystem
- ephemeral `/workspace` and `/tmp`
- `--cap-drop=ALL`
- `no-new-privileges`
- default Docker seccomp profile
- CPU limit
- memory limit
- PID limit
- compilation timeout
- execution timeout
- output limit
- file-size/open-file limits
- `--rm` and explicit cleanup
- anonymous rate limiting
- concurrent job cap

## Deployment gate

Before public launch, on a network-enabled CI machine and a Docker-enabled private compiler host:

1. Generate `frontend/package-lock.json` and `backend/package-lock.json` with `npm install`.
2. Run clean `npm ci` installations.
3. Run frontend and backend production builds.
4. Build the sandbox image from a verified immutable base image/digest.
5. Start the backend and run `/api/health`.
6. Run the Docker compiler tests, including infinite loop, output abuse, memory abuse, PID abuse, filesystem access, and network access.
7. Verify the frontend in a real browser at mobile and desktop widths.
8. Configure the real frontend/API domains and HTTPS.

Do not expose the Docker daemon or sandbox containers directly to the public internet.
