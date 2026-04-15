"""Build an opencode snapshot from Dockerfile, then create a sandbox to verify it works."""

import sys
import time
import random
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from daytona import (
    Daytona,
    DaytonaConfig,
    CreateSnapshotParams,
    CreateSandboxFromSnapshotParams,
    Image,
    Resources,
)

OPENCODE_REF = sys.argv[1] if len(sys.argv) > 1 else "dev"
SNAPSHOT_PREFIX = sys.argv[2] if len(sys.argv) > 2 else "opencode-server"


def build_snapshot_name() -> str:
    safe_ref = OPENCODE_REF.replace("/", "-")
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = random.randint(1000, 9999)
    return f"{SNAPSHOT_PREFIX}-{safe_ref}-{ts}-{suffix}"


def main():
    daytona = Daytona(DaytonaConfig())

    # --- Phase 1: Create snapshot ---
    snapshot_name = build_snapshot_name()
    dockerfile_path = Path(__file__).parent / "Dockerfile"

    print(f"=== Creating snapshot: {snapshot_name} ===")
    print(f"    Dockerfile: {dockerfile_path}")
    print(f"    Ref:        {OPENCODE_REF}")
    print()

    image = Image.from_dockerfile(str(dockerfile_path))
    t0 = time.perf_counter()

    snapshot = daytona.snapshot.create(
        CreateSnapshotParams(
            name=snapshot_name,
            image=image,
            resources=Resources(cpu=2, memory=4, disk=10),
        ),
        on_logs=lambda line: print(f"  [build] {line}", end=""),
    )

    build_secs = time.perf_counter() - t0
    print(f"\n=== Snapshot created: {snapshot.name} ({build_secs:.1f}s) ===\n")

    # --- Phase 2: Create sandbox from snapshot ---
    print("=== Creating sandbox from snapshot ===")
    t0 = time.perf_counter()

    sandbox = daytona.create(
        CreateSandboxFromSnapshotParams(
            snapshot=snapshot.name,
            env_vars={"OPENAI_API_KEY": _get_env("OPENAI_API_KEY")},
            auto_stop_interval=0,
        ),
        timeout=120,
    )

    create_secs = time.perf_counter() - t0
    print(f"    Sandbox ID: {sandbox.id} ({create_secs:.1f}s)")

    # --- Phase 3: Verify ---
    print("\n=== Verifying opencode inside sandbox ===")

    result = sandbox.process.exec("opencode --version", timeout=30)
    print(f"    opencode --version: {result.result.strip()}")
    print(f"    exit code: {result.exit_code}")

    if result.exit_code != 0:
        print("    FAILED: opencode binary not working")
        sandbox.delete()
        return

    result = sandbox.process.exec(
        "opencode serve --port 4096 --hostname 127.0.0.1 &"
        " sleep 3 && curl -sf http://127.0.0.1:4096/doc | head -c 200",
        timeout=30,
    )
    print(f"    serve check exit code: {result.exit_code}")
    if result.result.strip():
        print(f"    /doc response (first 200 chars): {result.result.strip()[:200]}")

    # --- Cleanup ---
    print("\n=== Cleaning up sandbox ===")
    sandbox.delete()
    print(f"    Sandbox {sandbox.id} deleted")

    print(f"\n=== Done ===")
    print(f"    Snapshot ready: {snapshot.name}")
    print(f"    Create a sandbox with:")
    print(f'      daytona create --snapshot {snapshot.name}')


def _get_env(key: str) -> str:
    import os
    val = os.environ.get(key, "")
    if not val:
        print(f"    WARNING: {key} not set in .env")
    return val


if __name__ == "__main__":
    main()
