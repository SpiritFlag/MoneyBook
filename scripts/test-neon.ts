import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonBookReader, createNeonBookSnapshotReader, createNeonRepository } from "../src/lib/neon-repository";
import { newAsset } from "../src/lib/asset";
import { newExpense } from "../src/lib/expense";
import { newOperation, newRow, statementRows } from "../src/lib/operations";
import { exampleLoan } from "../src/lib/loan-sample";

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
  await Promise.all([
    a.importLoans([exampleLoan]),
    b.saveAsset({ ...newAsset(date), name: "Additional test wallet", kind: "cash", openingBalance: "0" }, randomUUID(), null),
  ]);
  assert.deepEqual(await b.listLoans(), [exampleLoan], "Concurrent asset writes must preserve imported loans");
  assert.deepEqual(await a.importLoans([exampleLoan]), { added: 0, total: 1 });
  assert.deepEqual(await createNeonRepository(other, connection).listLoans(), []);
  const cardId = randomUUID();
  await a.saveCard({ name: "Integration card", issuer: "Test issuer" }, cardId);
  assert.equal((await b.listCards())[0].id, cardId);
  assert.deepEqual(await createNeonRepository(other, connection).listCards(), []);
  const id = randomUUID();
  const expense = { ...newExpense(date), title: "Test expense", assetId: walletId, paymentKind: "cash" as const, paymentMethod: "Test wallet", paidAmount: "100", topup: { sameTime: true, date, time: null, fromId: bankId, amount: "1000", received: "1000", rate: "" } };
  await a.save(expense, id, null);
  assert.equal((await b.list()).length, 1);
  assert.equal((await b.listOperations()).length, 1, "Linked top-up must persist atomically");
  const beforeRead = await sql`SELECT revision, payload FROM moneybook.books WHERE owner_id = ${owner}`;
  const readOnlyBook = await createNeonBookReader(owner, connection)();
  assert.equal(readOnlyBook.expenses[0].id, id);
  assert.equal(readOnlyBook.operations.length, 1);
  assert.equal(readOnlyBook.cards[0].id, cardId);
  assert.deepEqual(readOnlyBook.loans, [exampleLoan]);
  assert.equal((await createNeonBookReader(other, connection)()).expenses.length, 0);
  const snapshot = await createNeonBookSnapshotReader(owner, connection)();
  assert.equal(snapshot.revision, String(beforeRead[0].revision));
  assert.deepEqual(snapshot.book, readOnlyBook);
  const emptySnapshot = await createNeonBookSnapshotReader(other, connection)();
  assert.equal(emptySnapshot.revision, "0");
  assert.equal((await sql`SELECT owner_id FROM moneybook.books WHERE owner_id = ${other}`).length, 0, "Empty snapshot reads must not insert a book");
  assert.deepEqual(await sql`SELECT revision, payload FROM moneybook.books WHERE owner_id = ${owner}`, beforeRead, "MCP SELECT reader must preserve both revision and payload");
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
  assert.equal((await createNeonRepository(owner, connection).listCards())[0].id, cardId, "Other saves must preserve registered cards");
  await a.saveCard({ name: "Renamed integration card", issuer: "Test issuer" }, cardId, 1);
  assert.equal((await b.listCards())[0].name, "Renamed integration card");
  await assert.rejects(a.saveCard({ name: "Stale card", issuer: "" }, cardId, 1), { status: 409 });
  await a.saveGameCurrency({ code: "Integration gems", fixedRate: "2.5" }, null);
  assert.equal((await b.listGameCurrencies())[0].fixedRate, "2.5");
  assert.deepEqual(await outsider.listGameCurrencies(), []);
  const gameAssetId = randomUUID(), topupId = randomUUID();
  await a.saveAsset({ ...newAsset(date), name: "Game wallet", kind: "stored", currency: "Integration gems", openingBalance: "0" }, gameAssetId, null);
  assert.equal((await b.listAssets()).find(asset => asset.id === gameAssetId)?.valuationRate, "2.5");
  await a.saveOperation({ ...newOperation("transfer", date), rows: [{ ...newRow(date, "card-topup"), cardId, toId: gameAssetId, amount: "9000", received: "4000" }] }, topupId, null);
  const book = { expenses: await b.list(), assets: await b.listAssets(), operations: await b.listOperations(), cards: await b.listCards() };
  assert.equal(statementRows({ ...newOperation("statement", date), card: "Renamed integration card" }, book).find(row => row.id === `transfer:${topupId}/card-topup`)?.amount, 9000);
  console.log("PASS: custom game currency isolation, shared fixed rate and card-funded top-up persistence.");
  console.log("PASS: card registration and isolation, Neon persistence, concurrent first writes, atomic top-up, idempotency, owner isolation, revision conflict, validation rollback, operation persistence.");
} catch (error) {
  console.error("DB integration test failed:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "unknown");
  process.exitCode = 1;
} finally {
  // Remove only the two freshly generated test identities in the dedicated test database.
  await sql`DELETE FROM moneybook.books WHERE owner_id IN (${owner}, ${other})`;
}

}
void main().catch(() => { console.error('DB test setup failed'); process.exitCode = 1; });
