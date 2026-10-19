import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonRepository } from "../src/lib/neon-repository";
import { newAsset } from "../src/lib/asset";
import { newExpense } from "../src/lib/expense";
import { newOperation } from "../src/lib/operations";

async function main() {
const testEnv = parseEnv(readFileSync(".env.neon-test.local", "utf8"));
const appEnv = parseEnv(readFileSync(".env.local", "utf8"));
if (testEnv.MONEYBOOK_TEST_DATABASE !== "1" || !testEnv.DATABASE_URL || !appEnv.DATABASE_URL) throw new Error("Dedicated test database and application database required");
const connection = testEnv.DATABASE_URL;
assert.notEqual(new URL(connection).hostname.replace("-pooler.", "."), new URL(appEnv.DATABASE_URL).hostname.replace("-pooler.", "."), "Integration tests must not use the application database");
const sql = neon(connection);
const owner = `integration_${randomUUID()}`;
const other = `integration_${randomUUID()}`;
const date = "2026-10-19";
const a = createNeonRepository(owner, connection);
const b = createNeonRepository(owner, connection);
try {
  assert.deepEqual(await a.list(), []);
  const bankId = randomUUID(), walletId = randomUUID();
  await Promise.all([
    a.saveAsset({ ...newAsset(date), name: "Test bank", kind: "account", openingBalance: "10000" }, bankId, null),
    b.saveAsset({ ...newAsset(date), name: "Test wallet", kind: "cash", openingBalance: "0" }, walletId, null),
  ]);
  assert.equal((await a.listAssets()).length, 2, "Concurrent first writes must both survive");
  const id = randomUUID();
  const expense = { ...newExpense(date), title: "Test expense", assetId: walletId, paymentKind: "cash" as const, paymentMethod: "Test wallet", paidAmount: "100", topup: { sameTime: true, date, time: null, fromId: bankId, amount: "1000", received: "1000", rate: "" } };
  await a.save(expense, id, null);
  assert.equal((await b.list()).length, 1);
  assert.equal((await b.listOperations()).length, 1, "Linked top-up must persist atomically");
  await b.save(expense, id, null);
  assert.equal((await a.listOperations()).length, 1, "Retry must not duplicate top-up");
  const outsider = createNeonRepository(other, connection);
  assert.deepEqual(await outsider.list(), []);
  await assert.rejects(outsider.save(expense, id, 1));
  const changed = await Promise.allSettled([a.save({ ...expense, title: "First edit" }, id, 1), b.save({ ...expense, title: "Second edit" }, id, 1)]);
  assert.equal(changed.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = changed.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  const before = await a.list();
  const operationsBefore = await a.listOperations();
  await assert.rejects(a.save({ ...expense, topup: { ...expense.topup, fromId: randomUUID() } }, randomUUID(), null));
  assert.deepEqual(await a.list(), before, "Invalid related write must preserve expense data");
  assert.deepEqual(await a.listOperations(), operationsBefore);
  const income = { ...newOperation("income", date), title: "Test income", amount: "100", assetId: bankId };
  await a.saveOperation(income, randomUUID(), null);
  assert.equal((await createNeonRepository(owner, connection).listOperations()).length, 2);
  console.log("PASS: Neon persistence, concurrent first writes, atomic top-up, idempotency, owner isolation, revision conflict, validation rollback, operation persistence.");
} catch (error) {
  console.error("DB integration test failed:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "unknown");
  process.exitCode = 1;
} finally {
  // Remove only the two freshly generated test identities in the dedicated test database.
  await sql`DELETE FROM moneybook.books WHERE owner_id IN (${owner}, ${other})`;
}

}
void main().catch(() => { console.error('DB test setup failed'); process.exitCode = 1; });
