import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);

test("uses live Google data and an empty first-run state", async () => {
  const [dashboard, google, store, transfer] = await Promise.all([
    readFile(new URL("app/LiveDashboard.tsx", root), "utf8"),
    readFile(new URL("lib/google.ts", root), "utf8"),
    readFile(new URL("lib/store.ts", root), "utf8"),
    readFile(new URL("app/api/transfers/route.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /Connect your first Google account/);
  assert.doesNotMatch(dashboard, /alex\.home|Family Photos|Product launch footage/);
  assert.match(google, /access_type:\s*"offline"/);
  assert.match(google, /storageQuota/);
  assert.match(store, /aes-256-gcm/);
  assert.match(transfer, /Verification failed/);
  assert.match(transfer, /sourceRetained:\s*true/);
});
