# CForge Sandbox Security — Part 5

CForge treats submitted C code as hostile input.

## Isolation boundary

Every compile/run request creates a fresh Docker container from `SANDBOX_IMAGE`. The source and optional stdin are streamed as an in-memory tar archive into the container; no host directory is bind-mounted into it.

The container is launched with:

- `--network=none`
- `--read-only`
- `--cap-drop=ALL`
- `--security-opt=no-new-privileges:true`
- `--pids-limit`
- `--memory` and equal `--memory-swap`
- `--cpus`
- restrictive `nofile` and `fsize` ulimits
- ephemeral `/workspace` and `/tmp` tmpfs filesystems
- `--rm` and explicit cleanup on process completion/failure

The image itself runs as the unprivileged `cforge` user (UID 10001).

## Network policy

The execution namespace has no network interface. This blocks internet access and connections to localhost, internal services, and cloud metadata endpoints from user programs.

## Public deployment note

The backend must have a controlled way to talk to a Docker daemon. Do not mount `/var/run/docker.sock` into the public web application or sandbox containers. Prefer a dedicated compiler-worker host/VM with a hardened or rootless Docker daemon and a narrow application boundary.

## Resource policy

Defaults are intentionally bounded and configurable through environment variables. Source and stdin are validated before sandbox creation. stdout/stderr collection is capped in the backend and the sandbox is terminated when the cap is exceeded.

## Rate limiting

`POST /api/compile` and `POST /api/run` have anonymous in-memory IP rate limiting. For a multi-instance deployment, replace this with a shared limiter at the trusted edge or gateway in a later hardening pass.

## Testing

Security tests are written to exercise timeout, output, memory, PID, filesystem, and network isolation when Docker is available. They are explicitly skipped when Docker is unavailable; skipped tests are never reported as passed.

## Production audit notes

- The public API should run on a dedicated compiler host/VM with Docker access. Do not expose the Docker daemon or socket to the public internet.
- Sandbox jobs are capped by a configurable concurrency limit (`MAX_CONCURRENT_JOBS`, default 4) in addition to per-container CPU, memory, PID, timeout, and output limits.
- Client disconnects propagate an abort signal to the backend job and trigger container termination so a cancelled request does not intentionally keep a compiler job running.
- The sandbox explicitly uses Docker's default seccomp profile, drops all Linux capabilities, enables `no-new-privileges`, disables networking, and runs as UID 10001.
- Docker and Linux should be patched and monitored. Container isolation is defense-in-depth and does not eliminate kernel/runtime vulnerabilities.
