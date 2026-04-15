import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env") });

import { Daytona, Image } from "@daytona/sdk";
import type { CreateSandboxFromSnapshotParams } from "@daytona/sdk";

type Sandbox = Awaited<ReturnType<Daytona["create"]>>;

const OPENCODE_REF = process.argv[2] || "dev";
const SNAPSHOT_PREFIX = process.argv[3] || "opencode-server";

function buildSnapshotName(): string {
  const safeRef = OPENCODE_REF.replaceAll("/", "-");
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${SNAPSHOT_PREFIX}-${safeRef}-${ts}-${suffix}`;
}

function elapsed(t0: number): string {
  return `${((performance.now() - t0) / 1000).toFixed(1)}s`;
}

function env(key: string): string {
  const val = process.env[key] ?? "";
  if (!val) console.log(`    WARNING: ${key} not set in .env`);
  return val;
}

async function checkServe(sandbox: Sandbox): Promise<boolean> {
  const result = await sandbox.process.executeCommand(
    "cd /workspace && opencode serve --port 4096 --hostname 127.0.0.1 > /tmp/serve.log 2>&1 &" +
      " sleep 4 && curl -sf http://127.0.0.1:4096/global/health",
    undefined,
    undefined,
    30,
  );
  console.log(`    serve health check exit code: ${result.exitCode}`);
  const body = result.result.trim();
  if (body) {
    console.log(`    /global/health: ${body.slice(0, 300)}`);
    return true;
  }
  const logs = await sandbox.process.executeCommand("cat /tmp/serve.log", undefined, undefined, 10);
  console.log(`    WARNING: no response. Server logs:\n${logs.result.trim().slice(0, 500)}`);
  return false;
}

async function main() {
  const daytona = new Daytona();

  // --- Phase 1: Create snapshot ---
  const snapshotName = buildSnapshotName();
  const dockerfilePath = resolve(__dirname, "Dockerfile");

  console.log(`=== Creating snapshot: ${snapshotName} ===`);
  console.log(`    Dockerfile: ${dockerfilePath}`);
  console.log(`    Ref:        ${OPENCODE_REF}`);
  console.log();

  const image = Image.fromDockerfile(dockerfilePath);
  (image as any)._dockerfile = (image as any)._dockerfile.replace(
    "ARG OPENCODE_REF=dev",
    `ARG OPENCODE_REF=${OPENCODE_REF}`,
  );

  let t0 = performance.now();
  const snapshot = await daytona.snapshot.create(
    {
      name: snapshotName,
      image,
      resources: { cpu: 2, memory: 4, disk: 10 },
    },
    { onLogs: (chunk: string) => process.stdout.write(`  [build] ${chunk}`) },
  );
  console.log(`\n=== Snapshot created: ${snapshot.name} (${elapsed(t0)}) ===\n`);

  // --- Phase 2: Create sandbox ---
  console.log("=== Creating sandbox from snapshot ===");
  t0 = performance.now();

  const sandbox = await daytona.create(
    {
      snapshot: snapshot.name,
      envVars: { OPENAI_API_KEY: env("OPENAI_API_KEY") },
      autoStopInterval: 0,
    } satisfies CreateSandboxFromSnapshotParams,
    { timeout: 120 },
  );
  console.log(`    Sandbox ID: ${sandbox.id} (${elapsed(t0)})`);

  // --- Phase 3: Verify ---
  console.log("\n=== Verifying opencode inside sandbox ===");

  let result = await sandbox.process.executeCommand("opencode --version", undefined, undefined, 30);
  console.log(`    opencode --version: ${result.result.trim()}`);
  console.log(`    exit code: ${result.exitCode}`);

  if (result.exitCode !== 0) {
    console.log("    FAILED: opencode binary not working");
    await sandbox.delete();
    return;
  }

  if (!(await checkServe(sandbox))) {
    await sandbox.delete();
    return;
  }

  // --- Phase 4: Stop → Start → Re-verify ---
  console.log("\n=== Stopping sandbox ===");
  t0 = performance.now();
  await sandbox.stop(60);
  console.log(`    Stopped (${elapsed(t0)})`);

  console.log("\n=== Starting sandbox ===");
  t0 = performance.now();
  await sandbox.start(60);
  console.log(`    Started (${elapsed(t0)})`);

  console.log("\n=== Re-verifying after restart ===");
  result = await sandbox.process.executeCommand("opencode --version", undefined, undefined, 30);
  console.log(`    opencode --version: ${result.result.trim()}`);

  if (!(await checkServe(sandbox))) {
    await sandbox.delete();
    return;
  }

  // --- Cleanup ---
  console.log("\n=== Cleaning up sandbox ===");
  await sandbox.delete();
  console.log(`    Sandbox ${sandbox.id} deleted`);

  console.log(`\n=== Done ===`);
  console.log(`    Snapshot ready: ${snapshot.name}`);
  console.log(`    Create a sandbox with:`);
  console.log(`      daytona create --snapshot ${snapshot.name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
