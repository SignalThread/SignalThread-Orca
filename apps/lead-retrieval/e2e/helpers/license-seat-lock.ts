import * as fs from "fs";
import * as path from "path";

/**
 * Cross-process mutex for license/seat e2e tests that mutate the shared
 * canonical (event_id, exhibitor_company_id) license row and app-seat pool.
 *
 * `test.describe.serial` only orders tests within one worker; multiple workers
 * or browser projects can still run different tests from the same block in parallel.
 *
 * Uses atomic O_EXCL file creation (`wx`) under the repo `e2e/` directory so all
 * workers share the same path; stale locks are cleared when the owning PID is gone.
 */
export const LICENSE_SEAT_LOCK_PATH = path.join(
  process.cwd(),
  "e2e",
  ".license-seat-lock"
);

function tryRemoveStaleLock(): void {
  try {
    const raw = fs.readFileSync(LICENSE_SEAT_LOCK_PATH, "utf8").trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) {
      fs.unlinkSync(LICENSE_SEAT_LOCK_PATH);
      return;
    }
    try {
      process.kill(pid, 0);
    } catch {
      fs.unlinkSync(LICENSE_SEAT_LOCK_PATH);
    }
  } catch {
    // Missing or unreadable — ignore
  }
}

export async function acquireLicenseSeatLock(): Promise<void> {
  const start = Date.now();
  const timeoutMs = 120_000;
  for (;;) {
    try {
      fs.writeFileSync(LICENSE_SEAT_LOCK_PATH, String(process.pid), {
        flag: "wx",
      });
      return;
    } catch {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `Timeout acquiring license seat lock at ${LICENSE_SEAT_LOCK_PATH} (${timeoutMs}ms)`
        );
      }
      tryRemoveStaleLock();
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 40));
    }
  }
}

export function releaseLicenseSeatLock(): void {
  try {
    const raw = fs.readFileSync(LICENSE_SEAT_LOCK_PATH, "utf8").trim();
    if (Number(raw) === process.pid) {
      fs.unlinkSync(LICENSE_SEAT_LOCK_PATH);
    }
  } catch {
    // Idempotent: already released or stolen
  }
}
