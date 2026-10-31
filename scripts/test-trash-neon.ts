import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonRepository, purgeExpiredNeonTrash } from "../src/lib/neon-repository";
import { newExpense } from "../src/lib/expense";

async function main() {
  const testEnv = parseEnv(readFileSync(".env.neon-test.local", "utf8"));
  const appEnv = parseEnv(readFileSync(".env.local", "utf8"));
  if (testEnv.MONEYBOOK_TEST_DATABASE !== "1" || !testEnv.DATABASE_URL || !appEnv.DATABASE_URL) throw new Error("Dedicated test database required");
  const connection = testEnv.DATABASE_URL;
  assert.notEqual(new URL(connection).hostname.replace("-pooler.", "."), new URL(appEnv.DATABASE_URL).hostname.replace("-pooler.", "."));
  const sql = neon(connection);
  const owner = `trash_integration_${randomUUID()}`, other = `trash_integration_${randomUUID()}`;
  const repository = createNeonRepository(owner, connection);
  const second = createNeonRepository(owner, connection);
  try {
    const id = randomUUID();
    await repository.save({ ...newExpense("2026-10-20"), title: "Trash integration expense", paymentMethod: "Test card", paidAmount: "100" }, id, null);
    const entry = await repository.moveToTrash("expense", id, 1);
    assert.equal((await second.list()).length, 0);
    assert.equal((await second.listTrash()).length, 1);
    await assert.rejects(createNeonRepository(other, connection).restoreTrash(entry.id), { status: 404 });
    await second.restoreTrash(entry.id);
    assert.equal((await repository.list())[0].revision, 2);
    assert.equal((await repository.listTrash()).length, 0);
    const expired = await repository.moveToTrash("expense", id, 2);
    const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = { ...expired, id: randomUUID() };
    const entries = JSON.stringify([{ ...expired, deletedAt: cutoff }, fresh]);
    await sql`UPDATE moneybook.books SET payload = jsonb_set(payload, '{trash}', ${entries}::jsonb), revision = revision + 1 WHERE owner_id = ${owner}`;
    const before = await sql`SELECT revision FROM moneybook.books WHERE owner_id = ${owner}`;
    assert.ok(await purgeExpiredNeonTrash(connection) >= 1);
    const after = await sql`SELECT revision, payload FROM moneybook.books WHERE owner_id = ${owner}`;
    assert.equal(Number(after[0].revision), Number(before[0].revision) + 1);
    assert.deepEqual(after[0].payload.trash.map((row: { id: string }) => row.id), [fresh.id]);
    await assert.rejects(repository.restoreTrash(expired.id), { status: 404 });
    assert.equal(await purgeExpiredNeonTrash(connection), 0);
    await repository.restoreTrash(fresh.id);
    assert.equal((await second.list()).length, 1);
    console.log("PASS: Neon trash deletion, restore, account isolation, 30-day SQL cleanup, revision and idempotency.");
  } finally {
    await sql`DELETE FROM moneybook.books WHERE owner_id IN (${owner}, ${other})`;
  }
}
void main().catch(error => { console.error("Trash DB test failed:", error instanceof Error ? error.name : "unknown"); process.exitCode = 1; });
