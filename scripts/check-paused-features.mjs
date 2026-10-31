import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";

// Run after npm run build. No credentials or real account data are needed.
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4321"], { stdio: "ignore", windowsHide: true });
const exit = once(server, "exit");
const origin = "http://127.0.0.1:4321";
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Verification server exited before startup");
    try { await fetch(`${origin}/api/buddy-reviews?month=2026-10`, { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { await setTimeout(500); }
  }
  assert.ok(ready, "Verification server must start");
  const checks = [
    ["/buddy", ["GET"]],
    ["/api/buddy-reviews?month=2026-10", ["GET", "HEAD"]],
    ["/mcp", ["GET", "HEAD", "POST", "DELETE", "OPTIONS"]],
    ["/.well-known/oauth-protected-resource", ["GET", "HEAD", "OPTIONS"]],
    ["/.well-known/oauth-protected-resource/mcp", ["GET", "HEAD", "OPTIONS"]],
    ["/.well-known/oauth-authorization-server", ["GET", "HEAD", "OPTIONS"]],
  ];
  let count = 0;
  for (const [path, methods] of checks) for (const method of methods) {
    const response = await fetch(`${origin}${path}`, { method, headers: { Authorization: "Bearer dormant-feature-test" }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 404, `${method} ${path} must stay closed even with a bearer token`);
    assert.equal(response.headers.get("www-authenticate"), null, "Disabled endpoints must not start OAuth");
    if (path !== "/buddy") assert.equal(response.headers.get("cache-control"), "private, no-store");
    count++;
  }
  console.log(`PASS: ${count} dormant page/API/MCP/discovery HTTP checks; no account data accessed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  server.kill();
  await exit;
}
