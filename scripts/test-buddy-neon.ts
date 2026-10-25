import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonBuddyReviews } from "../src/lib/neon-buddy-review";
import { createNeonRepository } from "../src/lib/neon-repository";
import { newExpense } from "../src/lib/expense";

async function main() {
  const test = parseEnv(await readFile(".env.neon-test.local", "utf8"));
  const app = parseEnv(await readFile(".env.local", "utf8"));
  assert.equal(test.MONEYBOOK_TEST_DATABASE, "1");
  assert.ok(test.DATABASE_URL && app.DATABASE_URL, "Both isolated and app database URLs are required");
  const host = (url: string) => new URL(url).hostname.replace("-pooler.", ".");
  assert.notEqual(host(test.DATABASE_URL), host(app.DATABASE_URL));
  assert.equal(host(test.DATABASE_URL), "ep-noisy-grass-aoaije8b.c-2.ap-southeast-1.aws.neon.tech");
  const sql = neon(test.DATABASE_URL), owner = `buddy_test_${randomUUID()}`, other = `buddy_test_${randomUUID()}`;
  try {
    const id = randomUUID(), book = createNeonRepository(owner, test.DATABASE_URL);
    await book.save({ ...newExpense("2026-10-20"), title: "Synthetic review expense", paymentKind: "cash", paymentMethod: "Test cash", paidAmount: "5000" }, id, null);
    const before = await sql`SELECT revision,payload FROM moneybook.books WHERE owner_id=${owner}`;
    const reviews = createNeonBuddyReviews(owner, test.DATABASE_URL), outsider = createNeonBuddyReviews(other, test.DATABASE_URL);
    const data = await reviews.read("2026-10");
    const input = { month: "2026-10", ...data.analysisInput, expenses: [{ expenseId: id, tags: ["必要", "자유 태그"], comment: "가상 검증" }], monthlyComment: "가상 월 평가", idempotencyKey: randomUUID() };
    const saved = await reviews.save(input), replay = await reviews.save(input);
    assert.equal(saved.outcome, "buddy_review_saved"); assert.equal(replay.replayed, true); assert.deepEqual(replay.snapshot, saved.snapshot);
    assert.equal((await reviews.read("2026-10")).summary?.state, "ready");
    assert.equal((await outsider.read("2026-10")).summary, null);
    await assert.rejects(outsider.save(input));
    assert.deepEqual(await sql`SELECT revision,payload FROM moneybook.books WHERE owner_id=${owner}`, before);
    const fresh = await reviews.read("2026-10");
    const concurrent = await Promise.allSettled([1, 2].map(n => reviews.save({ month: "2026-10", ...fresh.analysisInput, monthlyComment: `concurrent-${n}`, idempotencyKey: randomUUID() })));
    assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await reviews.read("2026-10")).revision, 2);
    await book.save({ ...newExpense("2026-10-20"), title: "Changed synthetic expense", paymentKind: "cash", paymentMethod: "Test cash", paidAmount: "6000" }, id, 1);
    const stale = await reviews.read("2026-10");
    assert.equal(stale.summary?.state, "stale"); assert.equal(stale.expenses[0].review?.state, "stale");
    console.log(JSON.stringify({ passed: true, isolatedDatabase: true, saveReadReplay: true, concurrentRevisionGuard: true, accountIsolation: true, financialBookUnchangedByReview: true, staleDetection: true }));
  } finally {
    await sql`DELETE FROM moneybook.buddy_reviews WHERE owner_id IN (${owner},${other})`;
    await sql`DELETE FROM moneybook.books WHERE owner_id IN (${owner},${other})`;
  }
}
void main().catch(error => { console.error("Buddy DB verification failed", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "unknown"); process.exitCode = 1; });
