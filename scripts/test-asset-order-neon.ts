import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonRepository } from "../src/lib/neon-repository";
import { newAsset } from "../src/lib/asset";

async function main() {
  const testEnv = parseEnv(readFileSync(".env.neon-test.local", "utf8"));
  const appEnv = parseEnv(readFileSync(".env.local", "utf8"));
  if (testEnv.MONEYBOOK_TEST_DATABASE !== "1" || !testEnv.DATABASE_URL || !appEnv.DATABASE_URL) throw new Error("Dedicated test database required");
  const connection = testEnv.DATABASE_URL;
  assert.notEqual(new URL(connection).hostname.replace("-pooler.", "."), new URL(appEnv.DATABASE_URL).hostname.replace("-pooler.", "."));
  const sql = neon(connection);
  const owner = `asset_order_${randomUUID()}`, other = `asset_order_${randomUUID()}`;
  const first = createNeonRepository(owner, connection), second = createNeonRepository(owner, connection);
  try {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (let index = 0; index < ids.length; index++) await first.saveAsset({ ...newAsset("2026-10-31"), name: `Test bank ${index}`, openingBalance: "10000" }, ids[index], null);
    const attempts = await Promise.allSettled([
      first.reorderAssets({ expectedIds: ids, ids: [ids[1], ids[0], ids[2]] }),
      second.reorderAssets({ expectedIds: ids, ids: [ids[2], ids[1], ids[0]] }),
    ]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    const saved = await second.listAssets();
    const expectedIds = saved.map(asset => asset.id);
    const nextIds = [...expectedIds].reverse();
    const editing = saved.find(asset => asset.id === ids[0])!;
    await Promise.all([
      first.reorderAssets({ expectedIds, ids: nextIds }),
      second.saveAsset({ ...editing, name: "Renamed bank" }, editing.id, editing.revision),
    ]);
    const final = await createNeonRepository(owner, connection).listAssets();
    assert.deepEqual(final.map(asset => asset.id), nextIds);
    assert.equal(final.find(asset => asset.id === editing.id)?.name, "Renamed bank");
    assert.equal(final.find(asset => asset.id === editing.id)?.revision, 2);
    assert.ok(final.every(asset => asset.openingBalance === "10000"));
    const outsider = createNeonRepository(other, connection);
    await assert.rejects(outsider.reorderAssets({ expectedIds, ids: nextIds }), { status: 409 });
    assert.deepEqual(await outsider.listAssets(), []);
    console.log("PASS: Neon asset order persistence, concurrent-order conflict, concurrent asset edit preservation and account isolation.");
  } finally {
    await sql`DELETE FROM moneybook.books WHERE owner_id IN (${owner}, ${other})`;
  }
}
void main().catch(error => { console.error("Asset order DB test failed:", error instanceof Error ? error.name : "unknown"); process.exitCode = 1; });
